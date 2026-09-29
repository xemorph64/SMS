package in.gov.ntro.sih.ms;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gov.ntro.sih.ms.domain.Capture;
import in.gov.ntro.sih.ms.domain.Finding;
import in.gov.ntro.sih.ms.domain.MailSession;
import in.gov.ntro.sih.ms.repo.CaptureRepository;
import in.gov.ntro.sih.ms.repo.IncidentRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * The dual-track incident state machine, driven end to end through the REST
 * API with real roles.
 *
 * <p>Evidence is seeded straight into the repositories rather than run through
 * the Python engine, so these tests exercise the workflow — the thing this
 * file exists to pin — on any machine, engine or no engine.
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("incident triage → parallel tracks → audit gate")
class IncidentWorkflowTest {

    @Autowired private WebApplicationContext context;
    @Autowired private CaptureRepository captures;
    @Autowired private IncidentRepository incidents;
    @Autowired private in.gov.ntro.sih.ms.repo.MailSessionRepository sessionRepo;
    @Autowired private in.gov.ntro.sih.ms.service.IncidentService incidentService;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(SecurityMockMvcConfigurers.springSecurity())
                .build();
        incidents.deleteAll();
        captures.deleteAll();
    }

    /**
     * One capture with one session carrying a critical finding — enough
     * evidence for the detector to open an incident against. The session side
     * owns the association (the capture's list is the inverse), so the session
     * and its finding are saved explicitly.
     */
    private Long seedEvidence() {
        Capture c = new Capture();
        c.setFilename("evidence.pcap");
        c.setSha256("a".repeat(64));
        c.setSizeBytes(1);
        c.setStatus(Capture.Status.COMPLETED);
        c = captures.save(c);

        MailSession s = new MailSession();
        s.setCapture(c);
        s.setStreamIndex(0);
        s.setProtocol("smtp");
        Finding f = new Finding();
        f.setSession(s);
        f.setRuleId("SMS-TEST-001");
        f.setSeverity("critical");
        f.setTitle("test weakness");
        s.getFindings().add(f);
        c.getSessions().add(s);
        sessionRepo.save(s);
        // The production path runs detection inside the analysis transaction;
        // the seed mirrors it so the workflow under test begins from DETECTED.
        incidentService.detectFrom(c);
        return c.getId();
    }

    /** The incident the detector opened for stream 0 of this capture. */
    private Long incidentId() {
        return incidents.findAll().stream()
                .filter(i -> "0".equals(i.getStreamId()))
                .findFirst().orElseThrow().getId();
    }

    // ------------------------------------------------------------------ happy path

    @Test
    @DisplayName("triage escalates, starts both tracks and the 6h CERT-In clock in UTC")
    void escalationStartsBothTracksAndSlaClock() throws Exception {
        seedEvidence();
        Long id = incidentId();

        String body = mvc.perform(post("/api/incidents/{id}/triage", id)
                        .with(user("analyst", "ROLE_SOC_ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"ESCALATE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ESCALATED"))
                .andExpect(jsonPath("$.snapshotHash").isNotEmpty())
                .andExpect(jsonPath("$.irTrack.irStatus").value("INVESTIGATING"))
                .andExpect(jsonPath("$.dfTrack.dfStatus").value("EVIDENCE_LOCKED"))
                .andReturn().getResponse().getContentAsString();

        Instant escalatedAt = Instant.parse(com.jayway.jsonpath.JsonPath.read(body, "$.escalatedAt"));
        Instant deadline = Instant.parse(com.jayway.jsonpath.JsonPath.read(body, "$.certInClockDeadline"));
        assertThat(deadline).isEqualTo(escalatedAt.plus(Duration.ofHours(6)));
        assertThat(escalatedAt).isCloseTo(Instant.now(), org.assertj.core.api.Assertions.within(60, ChronoUnit.SECONDS));
    }

    @Test
    @DisplayName("full happy path: parallel tracks converge, audit approves, incident closes")
    void fullHappyPath() throws Exception {
        seedEvidence();
        Long id = incidentId();

        escalate(id);
        walkIr(id, "CONTAINED", "REMEDIATED", "RECOVERED");

        // IR is finished but forensics has not submitted: the parent must NOT
        // converge on one track alone.
        mvc.perform(get("/api/incidents/{id}", id).with(user("auditor", "ROLE_AUDITOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ESCALATED"));

        walkDf(id, "Disk image acquired; timeline reconstructed.", "ANALYZING", "REPORT_GENERATED", "REPORT_SUBMITTED");

        // Both done — the gate opens by itself.
        mvc.perform(get("/api/incidents/{id}", id).with(user("auditor", "ROLE_AUDITOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AWAITING_AUDIT"))
                .andExpect(jsonPath("$.irTrack.irStatus").value("RECOVERED"))
                .andExpect(jsonPath("$.dfTrack.dfStatus").value("REPORT_SUBMITTED"));

        mvc.perform(post("/api/incidents/{id}/audit", id)
                        .with(user("auditor", "ROLE_AUDITOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"verdict\":\"APPROVED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("VERIFIED_CLOSED"))
                .andExpect(jsonPath("$.auditHistory[0].verdict").value("APPROVED"));
    }

    // ------------------------------------------------------------------ convergence gate

    @Test
    @DisplayName("DF reaching REPORT_SUBMITTED alone does not move the parent")
    void dfAloneDoesNotConverge() throws Exception {
        seedEvidence();
        Long id = incidentId();
        escalate(id);
        walkDf(id, "Report ready while IR still works.", "ANALYZING", "REPORT_GENERATED", "REPORT_SUBMITTED");

        mvc.perform(get("/api/incidents/{id}", id).with(user("auditor", "ROLE_AUDITOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ESCALATED"));
    }

    // ------------------------------------------------------------------ rejections

    @Test
    @DisplayName("REJECTED_IR resets only the IR track; forensics keeps its submitted report")
    void irRejectionResetsOnlyIr() throws Exception {
        seedEvidence();
        Long id = incidentId();
        reachGate(id);

        mvc.perform(post("/api/incidents/{id}/audit", id)
                        .with(user("auditor", "ROLE_AUDITOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"verdict\":\"REJECTED_IR\",\"reason\":\"Recovery not evidenced: no service restart in the timeline.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ESCALATED"))
                .andExpect(jsonPath("$.irTrack.irStatus").value("INVESTIGATING"))
                .andExpect(jsonPath("$.dfTrack.dfStatus").value("REPORT_SUBMITTED"))
                .andExpect(jsonPath("$.dfTrack.forensicReport").isNotEmpty());

        // And the reworked IR can walk forward again and re-converge.
        walkIr(id, "CONTAINED", "REMEDIATED", "RECOVERED");
        mvc.perform(get("/api/incidents/{id}", id).with(user("auditor", "ROLE_AUDITOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AWAITING_AUDIT"));
    }

    @Test
    @DisplayName("REJECTED_FORENSICS resets only the DF track; evidence lock survives")
    void forensicsRejectionResetsOnlyDf() throws Exception {
        seedEvidence();
        Long id = incidentId();
        reachGate(id);

        mvc.perform(post("/api/incidents/{id}/audit", id)
                        .with(user("auditor", "ROLE_AUDITOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"verdict\":\"REJECTED_FORENSICS\",\"reason\":\"Timeline gap between frames 40-58; re-examine.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ESCALATED"))
                .andExpect(jsonPath("$.dfTrack.dfStatus").value("ANALYZING"))
                .andExpect(jsonPath("$.irTrack.irStatus").value("RECOVERED"));

        // The lock is immutable: the reset must not have touched it.
        mvc.perform(get("/api/incidents/{id}", id).with(user("auditor", "ROLE_AUDITOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dfTrack.evidenceLockHash").value(snapshotHashOf(id)));
    }

    // ------------------------------------------------------------------ guards

    @Test
    @DisplayName("track steps cannot be skipped or reversed")
    void illegalTransitionsAreRejected() throws Exception {
        seedEvidence();
        Long id = incidentId();
        escalate(id);

        // Skipping INVESTIGATING straight to RECOVERED is not a legal step.
        mvc.perform(patch("/api/incidents/{id}/ir-track", id)
                        .with(user("ir", "ROLE_INCIDENT_RESPONDER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"irStatus\":\"RECOVERED\"}"))
                .andExpect(status().isConflict());

        // Repeating a completed step is not either.
        walkIr(id, "CONTAINED");
        mvc.perform(patch("/api/incidents/{id}/ir-track", id)
                        .with(user("ir", "ROLE_INCIDENT_RESPONDER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"irStatus\":\"CONTAINED\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("submission without a forensic report is refused; audit demands feedback on rejection")
    void requiredInputsAreEnforced() throws Exception {
        seedEvidence();
        Long id = incidentId();
        escalate(id);
        walkIr(id, "CONTAINED", "REMEDIATED", "RECOVERED");
        walkDf(id, null, "ANALYZING", "REPORT_GENERATED");

        // No report has been attached at any step — submission must fail.
        mvc.perform(patch("/api/incidents/{id}/df-track", id)
                        .with(user("forensics", "ROLE_FORENSICS_ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dfStatus\":\"REPORT_SUBMITTED\"}"))
                .andExpect(status().isConflict());

        // With the report attached the submission goes through and the gate opens.
        mvc.perform(patch("/api/incidents/{id}/df-track", id)
                        .with(user("forensics", "ROLE_FORENSICS_ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dfStatus\":\"REPORT_SUBMITTED\",\"forensicReport\":\"Full forensic report attached.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AWAITING_AUDIT"));

        // A rejection without written feedback is refused.
        mvc.perform(post("/api/incidents/{id}/audit", id)
                        .with(user("auditor", "ROLE_AUDITOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"verdict\":\"REJECTED_IR\"}"))
                .andExpect(status().isConflict());
    }

    // ------------------------------------------------------------------ RBAC

    @Test
    @DisplayName("wrong roles are forbidden at every workflow endpoint")
    void roleBoundariesAreEnforced() throws Exception {
        seedEvidence();
        Long id = incidentId();
        escalate(id);

        // A responder may not triage...
        mvc.perform(post("/api/incidents/{id}/triage", id)
                        .with(user("ir", "ROLE_INCIDENT_RESPONDER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"ESCALATE\"}"))
                .andExpect(status().isForbidden());

        // ...a forensic analyst may not advance IR...
        mvc.perform(patch("/api/incidents/{id}/ir-track", id)
                        .with(user("forensics", "ROLE_FORENSICS_ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"irStatus\":\"CONTAINED\"}"))
                .andExpect(status().isForbidden());

        // ...a responder may not advance DF...
        mvc.perform(patch("/api/incidents/{id}/df-track", id)
                        .with(user("ir", "ROLE_INCIDENT_RESPONDER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dfStatus\":\"ANALYZING\"}"))
                .andExpect(status().isForbidden());

        // ...and neither responder nor forensics may pass an audit verdict.
        mvc.perform(post("/api/incidents/{id}/audit", id)
                        .with(user("ir", "ROLE_INCIDENT_RESPONDER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"verdict\":\"APPROVED\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("dismissal requires a reason and is terminal")
    void dismissalRequiresReason() throws Exception {
        seedEvidence();
        Long id = incidentId();

        mvc.perform(post("/api/incidents/{id}/triage", id)
                        .with(user("analyst", "ROLE_SOC_ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"DISMISS\"}"))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/incidents/{id}/triage", id)
                        .with(user("analyst", "ROLE_SOC_ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"DISMISS\",\"reason\":\"Benign internal backup traffic.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DISMISSED"));

        // Terminal: a dismissed incident cannot be re-triaged.
        mvc.perform(post("/api/incidents/{id}/triage", id)
                        .with(user("analyst", "ROLE_SOC_ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"ESCALATE\"}"))
                .andExpect(status().isConflict());
    }

    // ------------------------------------------------------------------ helpers

    private void escalate(Long id) throws Exception {
        mvc.perform(post("/api/incidents/{id}/triage", id)
                        .with(user("analyst", "ROLE_SOC_ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"ESCALATE\"}"))
                .andExpect(status().isOk());
    }

    private void walkIr(Long id, String... steps) throws Exception {
        for (String step : steps) {
            mvc.perform(patch("/api/incidents/{id}/ir-track", id)
                            .with(user("ir", "ROLE_INCIDENT_RESPONDER"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"irStatus\":\"" + step + "\",\"remediationNotes\":\"step " + step + " done\"}"))
                    .andExpect(status().isOk());
        }
    }

    /** Walk DF steps in order; `report`, when non-null, rides along on every call. */
    private void walkDf(Long id, String report, String... steps) throws Exception {
        for (String step : steps) {
            String content = report == null
                    ? "{\"dfStatus\":\"" + step + "\"}"
                    : "{\"dfStatus\":\"" + step + "\",\"forensicReport\":\"" + report + "\"}";
            mvc.perform(patch("/api/incidents/{id}/df-track", id)
                            .with(user("forensics", "ROLE_FORENSICS_ANALYST"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(content))
                    .andExpect(status().isOk());
        }
    }

    private void reachGate(Long id) throws Exception {
        escalate(id);
        walkIr(id, "CONTAINED", "REMEDIATED", "RECOVERED");
        walkDf(id, "Full forensic report attached for audit.", "ANALYZING", "REPORT_GENERATED", "REPORT_SUBMITTED");
    }

    /** The incident's snapshot hash, read back through the API. */
    private String snapshotHashOf(Long id) throws Exception {
        String body = mvc.perform(get("/api/incidents/{id}", id).with(user("auditor", "ROLE_AUDITOR")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(body, "$.snapshotHash");
    }

    /** A real authority set: `roles("SOC_ANALYST")` becomes ROLE_SOC_ANALYST server-side. */
    private static RequestPostProcessor user(String name, String role) {
        return SecurityMockMvcRequestPostProcessors.user(name).roles(role.replace("ROLE_", ""));
    }
}
