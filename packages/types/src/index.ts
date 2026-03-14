// ─── Enums ────────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'sdr' | 'ae' | 'viewer'

export type LifecycleStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'meeting_scheduled'
  | 'meeting_completed'
  | 'qualified'
  | 'disqualified'
  | 'nurture'

export type SequenceStatus = 'draft' | 'active' | 'paused' | 'archived'

export type EnrollmentStatus =
  | 'active'
  | 'completed'
  | 'replied'
  | 'bounced'
  | 'unsubscribed'
  | 'paused'
  | 'error'

export type MessageStatus = 'pending' | 'scheduled' | 'sent' | 'delivered' | 'bounced' | 'failed'

export type ApprovalMode = 'auto' | 'first_only' | 'all'

export type ReplyIntent =
  | 'interested'
  | 'request_demo'
  | 'not_now'
  | 'not_relevant'
  | 'using_competitor'
  | 'pricing_concern'
  | 'security_concern'
  | 'referral'
  | 'unsubscribe'
  | 'out_of_office'
  | 'unknown'

export type MeetingStatus = 'proposed' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

export type StepType = 'email' | 'wait' | 'condition'

export type ActorType = 'ai' | 'user' | 'system'

export type CrmProvider = 'hubspot' | 'salesforce'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface JwtPayload {
  sub: string          // userId
  workspaceId: string
  role: WorkspaceRole
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  slug: string
  timezone: string
  brandVoice: string | null
  companyDescription: string | null
  logoUrl: string | null
  createdAt: string
}

export interface WorkspaceMember {
  userId: string
  workspaceId: string
  role: WorkspaceRole
  user: {
    id: string
    name: string
    email: string
    avatarUrl: string | null
  }
}

// ─── ICP ──────────────────────────────────────────────────────────────────────

export interface IcpConfig {
  id: string
  workspaceId: string
  name: string
  industries: string[]
  countries: string[]
  employeeSizeMin: number | null
  employeeSizeMax: number | null
  revenueSizeMin: number | null
  revenueSizeMax: number | null
  techStack: string[]
  seniorityLevels: string[]
  jobFunctions: string[]
  isDefault: boolean
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export interface Account {
  id: string
  workspaceId: string
  companyName: string
  domain: string | null
  industry: string | null
  country: string | null
  employeeSize: number | null
  revenueRange: string | null
  techStack: string[]
  fundingStage: string | null
  linkedinUrl: string | null
  websiteSummary: string | null
  score: number
  ownerId: string | null
  source: string
  createdAt: string
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export interface Contact {
  id: string
  accountId: string
  workspaceId: string
  firstName: string
  lastName: string
  email: string
  title: string | null
  seniority: string | null
  jobFunction: string | null
  linkedinUrl: string | null
  country: string | null
  score: number
  lifecycleStatus: LifecycleStatus
  ownerId: string | null
  unsubscribed: boolean
  createdAt: string
}

// ─── Sequence ─────────────────────────────────────────────────────────────────

export interface SequenceStep {
  id: string
  sequenceId: string
  position: number
  stepType: StepType
  delayDays: number
  condition: SequenceCondition | null
  templateSubject: string | null
  templateBody: string | null
  approvalMode: ApprovalMode
}

export interface SequenceCondition {
  trigger: 'opened' | 'clicked' | 'not_replied' | 'replied_with' | 'always'
  intentFilter?: ReplyIntent
}

export interface Sequence {
  id: string
  workspaceId: string
  name: string
  description: string | null
  status: SequenceStatus
  dailySendLimit: number
  sendWindowStart: string
  sendWindowEnd: string
  steps: SequenceStep[]
  createdAt: string
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  contactId: string
  enrollmentId: string
  sequenceStepId: string
  channel: 'email'
  subject: string
  body: string
  generatedByAi: boolean
  approvedBy: string | null
  sentAt: string | null
  status: MessageStatus
  openedAt: string | null
  clickedAt: string | null
}

// ─── Replies ──────────────────────────────────────────────────────────────────

export interface Reply {
  id: string
  messageId: string
  contactId: string
  body: string
  intent: ReplyIntent
  confidenceScore: number
  requiresHumanReview: boolean
  humanReviewedBy: string | null
  actionTaken: string | null
  receivedAt: string
}

// ─── Meetings ─────────────────────────────────────────────────────────────────

export interface Meeting {
  id: string
  workspaceId: string
  accountId: string
  contactId: string
  ownerId: string
  scheduledAt: string
  durationMinutes: number
  status: MeetingStatus
  source: string
  calendarEventId: string | null
  preCallBrief: string | null
  notes: string | null
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface SequenceStats {
  sequenceId: string
  name: string
  enrolled: number
  sent: number
  opened: number
  replied: number
  positiveReplies: number
  meetingsBooked: number
  openRate: number
  replyRate: number
  meetingRate: number
}

export interface DashboardMetrics {
  accountsCovered: number
  contactsTouched: number
  emailsSent: number
  openRate: number
  replyRate: number
  positiveReplyRate: number
  meetingsBooked: number
  crmSyncSuccess: number
}

// ─── API response wrappers ────────────────────────────────────────────────────

export interface ApiOk<T> {
  data: T
}

export interface ApiList<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface ApiError {
  error: string
  code?: string
  details?: unknown
}
