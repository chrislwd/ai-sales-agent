import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  uuid,
  pgEnum,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const workspaceRoleEnum = pgEnum('workspace_role', [
  'owner', 'admin', 'manager', 'sdr', 'ae', 'viewer',
])

export const lifecycleStatusEnum = pgEnum('lifecycle_status', [
  'new', 'contacted', 'replied', 'meeting_scheduled', 'meeting_completed',
  'qualified', 'disqualified', 'nurture',
])

export const sequenceStatusEnum = pgEnum('sequence_status', [
  'draft', 'active', 'paused', 'archived',
])

export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'active', 'completed', 'replied', 'bounced', 'unsubscribed', 'paused', 'error',
])

export const messageStatusEnum = pgEnum('message_status', [
  'pending', 'scheduled', 'sent', 'delivered', 'bounced', 'failed',
])

export const approvalModeEnum = pgEnum('approval_mode', [
  'auto', 'first_only', 'all',
])

export const replyIntentEnum = pgEnum('reply_intent', [
  'interested', 'request_demo', 'not_now', 'not_relevant', 'using_competitor',
  'pricing_concern', 'security_concern', 'referral', 'unsubscribe', 'out_of_office', 'unknown',
])

export const meetingStatusEnum = pgEnum('meeting_status', [
  'proposed', 'confirmed', 'completed', 'cancelled', 'no_show',
])

export const stepTypeEnum = pgEnum('step_type', ['email', 'wait', 'condition'])

export const actorTypeEnum = pgEnum('actor_type', ['ai', 'user', 'system'])

export const crmProviderEnum = pgEnum('crm_provider', ['hubspot', 'salesforce'])

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  brandVoice: text('brand_voice'),
  companyDescription: text('company_description'),
  logoUrl: text('logo_url'),
  // sending config
  dailySendLimit: integer('daily_send_limit').notNull().default(200),
  sendWindowStart: text('send_window_start').notNull().default('08:00'),
  sendWindowEnd: text('send_window_end').notNull().default('18:00'),
  // suppression
  suppressionDomains: text('suppression_domains').array().notNull().default(sql`'{}'`),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex('workspaces_slug_idx').on(t.slug),
}))

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  googleId: text('google_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
}))

export const workspaceMembers = pgTable('workspace_members', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  role: workspaceRoleEnum('role').notNull().default('sdr'),
  invitedBy: uuid('invited_by').references(() => users.id),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
}, (t) => ({
  pk: uniqueIndex('workspace_members_pk').on(t.userId, t.workspaceId),
}))

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: workspaceRoleEnum('role').notNull().default('sdr'),
  token: text('token').notNull(),
  invitedBy: uuid('invited_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  tokenIdx: uniqueIndex('invitations_token_idx').on(t.token),
}))

// ─── Email Accounts ───────────────────────────────────────────────────────────

export const emailAccounts = pgTable('email_accounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  displayName: text('display_name'),
  provider: text('provider').notNull().default('google'), // google | outlook | smtp
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  isActive: boolean('is_active').notNull().default(true),
  dailySentCount: integer('daily_sent_count').notNull().default(0),
  dailyLimitResetAt: timestamp('daily_limit_reset_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── ICP Configs ──────────────────────────────────────────────────────────────

export const icpConfigs = pgTable('icp_configs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  industries: text('industries').array().notNull().default(sql`'{}'`),
  countries: text('countries').array().notNull().default(sql`'{}'`),
  employeeSizeMin: integer('employee_size_min'),
  employeeSizeMax: integer('employee_size_max'),
  revenueSizeMin: integer('revenue_size_min'),
  revenueSizeMax: integer('revenue_size_max'),
  techStack: text('tech_stack').array().notNull().default(sql`'{}'`),
  seniorityLevels: text('seniority_levels').array().notNull().default(sql`'{}'`),
  jobFunctions: text('job_functions').array().notNull().default(sql`'{}'`),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── Accounts (Companies) ─────────────────────────────────────────────────────

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  companyName: text('company_name').notNull(),
  domain: text('domain'),
  industry: text('industry'),
  country: text('country'),
  employeeSize: integer('employee_size'),
  revenueRange: text('revenue_range'),
  techStack: text('tech_stack').array().notNull().default(sql`'{}'`),
  fundingStage: text('funding_stage'),
  linkedinUrl: text('linkedin_url'),
  websiteSummary: text('website_summary'),
  score: real('score').notNull().default(0),
  scoreBreakdown: jsonb('score_breakdown'),
  ownerId: uuid('owner_id').references(() => users.id),
  source: text('source').notNull().default('manual'),
  crmAccountId: text('crm_account_id'),
  crmProvider: crmProviderEnum('crm_provider'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  workspaceIdx: index('accounts_workspace_idx').on(t.workspaceId),
  domainIdx: index('accounts_domain_idx').on(t.workspaceId, t.domain),
}))

// ─── Contacts ─────────────────────────────────────────────────────────────────

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull().default(''),
  email: text('email').notNull(),
  title: text('title'),
  seniority: text('seniority'),  // manager | director | vp | c_level
  jobFunction: text('job_function'),  // sales | marketing | product | it | ...
  linkedinUrl: text('linkedin_url'),
  country: text('country'),
  phone: text('phone'),
  score: real('score').notNull().default(0),
  lifecycleStatus: lifecycleStatusEnum('lifecycle_status').notNull().default('new'),
  ownerId: uuid('owner_id').references(() => users.id),
  unsubscribed: boolean('unsubscribed').notNull().default(false),
  unsubscribedAt: timestamp('unsubscribed_at'),
  doNotContact: boolean('do_not_contact').notNull().default(false),
  crmContactId: text('crm_contact_id'),
  crmProvider: crmProviderEnum('crm_provider'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  workspaceIdx: index('contacts_workspace_idx').on(t.workspaceId),
  emailIdx: index('contacts_email_workspace_idx').on(t.workspaceId, t.email),
}))

// ─── Sequences ────────────────────────────────────────────────────────────────

export const sequences = pgTable('sequences', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: sequenceStatusEnum('status').notNull().default('draft'),
  icpConfigId: uuid('icp_config_id').references(() => icpConfigs.id),
  dailySendLimit: integer('daily_send_limit').notNull().default(50),
  sendWindowStart: text('send_window_start').notNull().default('08:00'),
  sendWindowEnd: text('send_window_end').notNull().default('18:00'),
  timezone: text('timezone').notNull().default('UTC'),
  defaultApprovalMode: approvalModeEnum('default_approval_mode').notNull().default('auto'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const sequenceSteps = pgTable('sequence_steps', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: uuid('sequence_id').notNull().references(() => sequences.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  stepType: stepTypeEnum('step_type').notNull().default('email'),
  delayDays: integer('delay_days').notNull().default(0),
  // condition to execute this step (null = always)
  condition: jsonb('condition'),
  // email content template (may contain {{contact.firstName}} etc)
  templateSubject: text('template_subject'),
  templateBody: text('template_body'),
  approvalMode: approvalModeEnum('approval_mode').notNull().default('auto'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  positionUnique: uniqueIndex('sequence_steps_position_idx').on(t.sequenceId, t.position),
}))

// ─── Enrollments ──────────────────────────────────────────────────────────────

export const sequenceEnrollments = pgTable('sequence_enrollments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: uuid('sequence_id').notNull().references(() => sequences.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  enrolledBy: uuid('enrolled_by').references(() => users.id),
  status: enrollmentStatusEnum('status').notNull().default('active'),
  currentStepPosition: integer('current_step_position').notNull().default(0),
  nextSendAt: timestamp('next_send_at'),
  completedAt: timestamp('completed_at'),
  pausedAt: timestamp('paused_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniqueEnrollment: uniqueIndex('enrollments_unique_idx').on(t.sequenceId, t.contactId),
  nextSendIdx: index('enrollments_next_send_idx').on(t.nextSendAt),
}))

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  enrollmentId: uuid('enrollment_id').notNull().references(() => sequenceEnrollments.id, { onDelete: 'cascade' }),
  sequenceStepId: uuid('sequence_step_id').notNull().references(() => sequenceSteps.id),
  emailAccountId: uuid('email_account_id').references(() => emailAccounts.id),
  channel: text('channel').notNull().default('email'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  generatedByAi: boolean('generated_by_ai').notNull().default(false),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  status: messageStatusEnum('status').notNull().default('pending'),
  sentAt: timestamp('sent_at'),
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
  bouncedAt: timestamp('bounced_at'),
  externalMessageId: text('external_message_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  contactIdx: index('messages_contact_idx').on(t.contactId),
  statusIdx: index('messages_status_idx').on(t.status),
}))

// ─── Replies ──────────────────────────────────────────────────────────────────

export const replies = pgTable('replies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  enrollmentId: uuid('enrollment_id').notNull().references(() => sequenceEnrollments.id),
  body: text('body').notNull(),
  rawEmail: text('raw_email'),
  intent: replyIntentEnum('intent').notNull().default('unknown'),
  confidenceScore: real('confidence_score').notNull().default(0),
  requiresHumanReview: boolean('requires_human_review').notNull().default(false),
  humanReviewedBy: uuid('human_reviewed_by').references(() => users.id),
  humanReviewedAt: timestamp('human_reviewed_at'),
  actionTaken: text('action_taken'),
  receivedAt: timestamp('received_at').notNull().defaultNow(),
})

// ─── Meetings ─────────────────────────────────────────────────────────────────

export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  contactId: uuid('contact_id').notNull().references(() => contacts.id),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  scheduledAt: timestamp('scheduled_at'),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  status: meetingStatusEnum('status').notNull().default('proposed'),
  source: text('source').notNull().default('auto'), // auto | manual
  calendarEventId: text('calendar_event_id'),
  preCallBrief: text('pre_call_brief'),
  meetingLink: text('meeting_link'),
  notes: text('notes'),
  enrollmentId: uuid('enrollment_id').references(() => sequenceEnrollments.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── CRM Connections ──────────────────────────────────────────────────────────

export const crmConnections = pgTable('crm_connections', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: crmProviderEnum('provider').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  portalId: text('portal_id'),     // HubSpot portal ID
  instanceUrl: text('instance_url'), // Salesforce instance URL
  fieldMappings: jsonb('field_mappings').notNull().default(sql`'{}'`),
  isActive: boolean('is_active').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  workspaceProviderIdx: uniqueIndex('crm_connections_workspace_provider_idx').on(t.workspaceId, t.provider),
}))

// ─── Activity Logs ────────────────────────────────────────────────────────────

export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  objectType: text('object_type').notNull(), // contact | account | sequence | message | meeting | ...
  objectId: uuid('object_id').notNull(),
  activityType: text('activity_type').notNull(),
  actorType: actorTypeEnum('actor_type').notNull().default('system'),
  actorId: uuid('actor_id'),  // userId if human
  payload: jsonb('payload').notNull().default(sql`'{}'`),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  objectIdx: index('activity_logs_object_idx').on(t.objectType, t.objectId),
  workspaceIdx: index('activity_logs_workspace_idx').on(t.workspaceId),
  createdIdx: index('activity_logs_created_idx').on(t.createdAt),
}))

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  tokenIdx: uniqueIndex('refresh_tokens_token_idx').on(t.token),
}))
