import { createContext, useContext } from 'react'

export const ReportContext = createContext({ report: null, setReport: () => {}, health: null })
export const useReport = () => useContext(ReportContext)

export const ROLES = {
  ROLE_SOC_ANALYST: {
    seat: 'soc',
    short: 'SOC',
    name: 'SOC Analyst',
    duty: 'Analyse captures, review findings, escalate real incidents.',
  },
  ROLE_INCIDENT_RESPONDER: {
    seat: 'ir',
    short: 'IR',
    name: 'Incident Responder',
    duty: 'Contain and remediate inside the 6-hour CERT-In window.',
  },
  ROLE_FORENSICS_ANALYST: {
    seat: 'forensics',
    short: 'Forensics',
    name: 'Forensics Analyst',
    duty: 'Take custody of evidence, analyse packets, file the report.',
  },
  ROLE_AUDITOR: {
    seat: 'audit',
    short: 'Auditor',
    name: 'Security Auditor',
    duty: 'Verify both tracks, then close or return the incident.',
  },
  ROLE_ADMIN: {
    seat: 'admin',
    short: 'Admin',
    name: 'Administrator',
    duty: 'Oversee the platform and every stage of the workflow.',
  },
}

export function roleInfo(role) {
  return ROLES[role] || { seat: null, short: 'Guest', name: 'Signed out', duty: '' }
}
