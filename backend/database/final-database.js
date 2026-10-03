'use strict';

/**
 * ============================================================
 * NOVA — FINAL DATABASE SETUP
 * PostgreSQL
 * ============================================================
 *
 * هذا الملف هو نقطة إنشاء قاعدة البيانات الفعلية.
 *
 * لا توجد بيانات تجريبية أو مستخدمون وهميون.
 * يتم إنشاء الهيكل فقط:
 *
 * users
 * profiles
 * contacts
 * conversations
 * conversation_members
 * messages
 * attachments
 * groups
 * group_members
 * communities
 * statuses
 * calls
 * notifications
 * devices
 * privacy_settings
 * security_settings
 *
 * بعد إنشاء الهيكل تبدأ البيانات الحقيقية من التسجيل
 * والاستخدام الفعلي للمنصة.
 * ============================================================
 */

'use strict';

require('dotenv').config();

let pg;

try {
  pg = require('pg');
} catch (error) {
  console.error('');
  console.error('NOVA DATABASE ERROR');
  console.error(
    'مكتبة PostgreSQL غير مثبتة.'
  );
  console.error(
    'ثبّت الحزمة pg ثم أعد تشغيل الملف.'
  );
  console.error('');

  process.exit(1);
}

const { Client } = pg;

/* ============================================================
 * Configuration
 * ============================================================ */

const config = {
  host:
    process.env.DB_HOST ||
    process.env.DATABASE_HOST ||
    '127.0.0.1',

  port:
    Number(
      process.env.DB_PORT ||
      process.env.DATABASE_PORT ||
      5432
    ),

  database:
    process.env.DB_NAME ||
    process.env.DATABASE_NAME ||
    'nova',

  user:
    process.env.DB_USER ||
    process.env.DATABASE_USER ||
    'postgres',

  password:
    process.env.DB_PASSWORD ||
    process.env.DATABASE_PASSWORD ||
    '',

  ssl:
    process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED !==
            'false',
        }
      : false,
};

/* ============================================================
 * Helpers
 * ============================================================ */

function log(message) {
  console.log(`[NOVA DATABASE] ${message}`);
}

function fail(message, error = null) {
  console.error('');
  console.error('========================================');
  console.error(' NOVA DATABASE ERROR');
  console.error('========================================');
  console.error('');
  console.error(message);

  if (error) {
    console.error('');
    console.error(
      error.message || error
    );
  }

  console.error('');

  process.exitCode = 1;
}

/* ============================================================
 * SQL
 * ============================================================ */

const SQL = [

/* ------------------------------------------------------------
 * Extensions
 * ------------------------------------------------------------ */

`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
`,

/* ------------------------------------------------------------
 * Users
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  username VARCHAR(50) UNIQUE,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(30) UNIQUE,

  password_hash TEXT,

  display_name VARCHAR(120),

  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'inactive',
        'suspended',
        'banned',
        'pending',
        'deleted'
      )
    ),

  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,

  role VARCHAR(30) NOT NULL DEFAULT 'user',

  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Profiles
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL UNIQUE
    REFERENCES users(id)
    ON DELETE CASCADE,

  display_name VARCHAR(120),
  bio TEXT,

  avatar_url TEXT,
  cover_url TEXT,

  gender VARCHAR(30),
  birth_date DATE,

  country VARCHAR(100),
  city VARCHAR(100),

  website TEXT,

  visibility VARCHAR(20) NOT NULL DEFAULT 'public'
    CHECK (
      visibility IN (
        'public',
        'friends',
        'private'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,

/* ------------------------------------------------------------
 * Contacts
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  contact_user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  type VARCHAR(20) NOT NULL DEFAULT 'contact'
    CHECK (
      type IN (
        'contact',
        'friend',
        'block'
      )
    ),

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'accepted',
        'rejected',
        'blocked',
        'declined'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (user_id <> contact_user_id),

  UNIQUE (
    user_id,
    contact_user_id,
    type
  )
);
`,

/* ------------------------------------------------------------
 * Conversations
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  type VARCHAR(30) NOT NULL DEFAULT 'direct'
    CHECK (
      type IN (
        'direct',
        'group',
        'community'
      )
    ),

  title VARCHAR(150),

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'archived',
        'disabled',
        'deleted'
      )
    ),

  owner_id UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Conversation Members
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id UUID NOT NULL
    REFERENCES conversations(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  role VARCHAR(20) NOT NULL DEFAULT 'member'
    CHECK (
      role IN (
        'owner',
        'admin',
        'member'
      )
    ),

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'left',
        'removed',
        'banned'
      )
    ),

  muted BOOLEAN NOT NULL DEFAULT FALSE,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,

  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,

  UNIQUE (
    conversation_id,
    user_id
  )
);
`,

/* ------------------------------------------------------------
 * Messages
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id UUID NOT NULL
    REFERENCES conversations(id)
    ON DELETE CASCADE,

  sender_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  reply_to_id UUID
    REFERENCES messages(id)
    ON DELETE SET NULL,

  type VARCHAR(30) NOT NULL DEFAULT 'text'
    CHECK (
      type IN (
        'text',
        'image',
        'video',
        'audio',
        'file',
        'system'
      )
    ),

  content TEXT,

  status VARCHAR(20) NOT NULL DEFAULT 'sent'
    CHECK (
      status IN (
        'sending',
        'sent',
        'delivered',
        'read',
        'failed',
        'deleted'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Attachments
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  conversation_id UUID
    REFERENCES conversations(id)
    ON DELETE CASCADE,

  message_id UUID
    REFERENCES messages(id)
    ON DELETE SET NULL,

  type VARCHAR(30) NOT NULL,

  original_name TEXT,
  storage_key TEXT,
  mime_type VARCHAR(150),

  size_bytes BIGINT,

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'ready',
        'failed',
        'deleted'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Groups
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  name VARCHAR(150) NOT NULL,
  description TEXT,

  avatar_url TEXT,
  cover_url TEXT,

  visibility VARCHAR(20) NOT NULL DEFAULT 'private'
    CHECK (
      visibility IN (
        'public',
        'private'
      )
    ),

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'archived',
        'disabled',
        'deleted'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Group Members
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  group_id UUID NOT NULL
    REFERENCES groups(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  role VARCHAR(20) NOT NULL DEFAULT 'member'
    CHECK (
      role IN (
        'owner',
        'admin',
        'moderator',
        'member'
      )
    ),

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'left',
        'removed',
        'banned'
      )
    ),

  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,

  UNIQUE (
    group_id,
    user_id
  )
);
`,

/* ------------------------------------------------------------
 * Communities
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  name VARCHAR(150) NOT NULL,
  description TEXT,

  avatar_url TEXT,
  cover_url TEXT,

  visibility VARCHAR(20) NOT NULL DEFAULT 'public'
    CHECK (
      visibility IN (
        'public',
        'private'
      )
    ),

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'archived',
        'disabled',
        'deleted'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Community Members
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  community_id UUID NOT NULL
    REFERENCES communities(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  role VARCHAR(20) NOT NULL DEFAULT 'member'
    CHECK (
      role IN (
        'owner',
        'admin',
        'moderator',
        'member'
      )
    ),

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'left',
        'removed',
        'banned'
      )
    ),

  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,

  UNIQUE (
    community_id,
    user_id
  )
);
`,

/* ------------------------------------------------------------
 * Statuses
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  type VARCHAR(20) NOT NULL DEFAULT 'text'
    CHECK (
      type IN (
        'text',
        'image',
        'video'
      )
    ),

  content TEXT,
  media_url TEXT,

  visibility VARCHAR(20) NOT NULL DEFAULT 'friends'
    CHECK (
      visibility IN (
        'public',
        'friends',
        'private'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Status Views
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS status_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  status_id UUID NOT NULL
    REFERENCES statuses(id)
    ON DELETE CASCADE,

  viewer_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (
    status_id,
    viewer_id
  )
);
`,

/* ------------------------------------------------------------
 * Calls
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  initiator_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  type VARCHAR(20) NOT NULL
    CHECK (
      type IN (
        'voice',
        'video'
      )
    ),

  status VARCHAR(20) NOT NULL DEFAULT 'created'
    CHECK (
      status IN (
        'created',
        'ringing',
        'active',
        'declined',
        'cancelled',
        'ended',
        'failed'
      )
    ),

  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,

/* ------------------------------------------------------------
 * Call Participants
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  call_id UUID NOT NULL
    REFERENCES calls(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'invited'
    CHECK (
      status IN (
        'invited',
        'joined',
        'left',
        'declined'
      )
    ),

  microphone_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  camera_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,

  UNIQUE (
    call_id,
    user_id
  )
);
`,

/* ------------------------------------------------------------
 * Notifications
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  actor_id UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  type VARCHAR(50) NOT NULL,

  title VARCHAR(200),
  body TEXT,

  entity_type VARCHAR(50),
  entity_id UUID,

  status VARCHAR(20) NOT NULL DEFAULT 'unread'
    CHECK (
      status IN (
        'unread',
        'read',
        'deleted'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Devices
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  device_type VARCHAR(30),
  device_name VARCHAR(150),

  push_token TEXT,

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'revoked'
      )
    ),

  last_seen_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Privacy Settings
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS privacy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL UNIQUE
    REFERENCES users(id)
    ON DELETE CASCADE,

  profile_visibility VARCHAR(20) NOT NULL DEFAULT 'public'
    CHECK (
      profile_visibility IN (
        'public',
        'friends',
        'private'
      )
    ),

  last_seen_visibility VARCHAR(20) NOT NULL DEFAULT 'friends'
    CHECK (
      last_seen_visibility IN (
        'everyone',
        'friends',
        'nobody'
      )
    ),

  status_visibility VARCHAR(20) NOT NULL DEFAULT 'friends'
    CHECK (
      status_visibility IN (
        'everyone',
        'friends',
        'nobody'
      )
    ),

  read_receipts BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,

/* ------------------------------------------------------------
 * Security Settings
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS security_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL UNIQUE
    REFERENCES users(id)
    ON DELETE CASCADE,

  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  login_alerts BOOLEAN NOT NULL DEFAULT TRUE,

  session_timeout_minutes INTEGER NOT NULL DEFAULT 10080
    CHECK (
      session_timeout_minutes > 0
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,

/* ------------------------------------------------------------
 * Security Events
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID
    REFERENCES users(id)
    ON DELETE CASCADE,

  event_type VARCHAR(60) NOT NULL,

  ip_address INET,
  user_agent TEXT,

  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,

/* ------------------------------------------------------------
 * Sessions
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  token_hash TEXT NOT NULL UNIQUE,

  device_id UUID
    REFERENCES devices(id)
    ON DELETE SET NULL,

  expires_at TIMESTAMPTZ NOT NULL,

  revoked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
`,

/* ------------------------------------------------------------
 * Verification Tokens
 * ------------------------------------------------------------ */

`
CREATE TABLE IF NOT EXISTS verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID
    REFERENCES users(id)
    ON DELETE CASCADE,

  identifier VARCHAR(255) NOT NULL,

  token_hash TEXT NOT NULL,

  type VARCHAR(30) NOT NULL
    CHECK (
      type IN (
        'email',
        'phone',
        'password_reset'
      )
    ),

  expires_at TIMESTAMPTZ NOT NULL,

  used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,

/* ============================================================
 * Indexes
 * ============================================================ */

`
CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);
`,

`
CREATE INDEX IF NOT EXISTS idx_users_phone
ON users(phone);
`,

`
CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username);
`,

`
CREATE INDEX IF NOT EXISTS idx_profiles_user_id
ON profiles(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_contacts_user_id
ON contacts(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_contacts_contact_user_id
ON contacts(contact_user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_conversation_members_user_id
ON conversation_members(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation_id
ON conversation_members(conversation_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
ON messages(conversation_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
ON messages(sender_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_messages_created_at
ON messages(created_at);
`,

`
CREATE INDEX IF NOT EXISTS idx_attachments_message_id
ON attachments(message_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_group_members_user_id
ON group_members(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_group_members_group_id
ON group_members(group_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_community_members_user_id
ON community_members(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_community_members_community_id
ON community_members(community_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_statuses_user_id
ON statuses(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_statuses_expires_at
ON statuses(expires_at);
`,

`
CREATE INDEX IF NOT EXISTS idx_status_views_status_id
ON status_views(status_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_calls_initiator_id
ON calls(initiator_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_call_participants_call_id
ON call_participants(call_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
ON notifications(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_notifications_status
ON notifications(status);
`,

`
CREATE INDEX IF NOT EXISTS idx_devices_user_id
ON devices(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_security_events_user_id
ON security_events(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_sessions_user_id
ON sessions(user_id);
`,

`
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
ON sessions(expires_at);
`,

`
CREATE INDEX IF NOT EXISTS idx_verification_tokens_identifier
ON verification_tokens(identifier);
`,

/* ============================================================
 * Updated At Trigger
 * ============================================================ */

`
CREATE OR REPLACE FUNCTION nova_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`,

/* ------------------------------------------------------------
 * Triggers
 * ------------------------------------------------------------ */

`
DROP TRIGGER IF EXISTS trg_users_updated_at
ON users;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_profiles_updated_at
ON profiles;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_contacts_updated_at
ON contacts;

CREATE TRIGGER trg_contacts_updated_at
BEFORE UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_conversations_updated_at
ON conversations;

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_messages_updated_at
ON messages;

CREATE TRIGGER trg_messages_updated_at
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_attachments_updated_at
ON attachments;

CREATE TRIGGER trg_attachments_updated_at
BEFORE UPDATE ON attachments
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_groups_updated_at
ON groups;

CREATE TRIGGER trg_groups_updated_at
BEFORE UPDATE ON groups
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_communities_updated_at
ON communities;

CREATE TRIGGER trg_communities_updated_at
BEFORE UPDATE ON communities
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_statuses_updated_at
ON statuses;

CREATE TRIGGER trg_statuses_updated_at
BEFORE UPDATE ON statuses
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_devices_updated_at
ON devices;

CREATE TRIGGER trg_devices_updated_at
BEFORE UPDATE ON devices
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_privacy_settings_updated_at
ON privacy_settings;

CREATE TRIGGER trg_privacy_settings_updated_at
BEFORE UPDATE ON privacy_settings
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

`
DROP TRIGGER IF EXISTS trg_security_settings_updated_at
ON security_settings;

CREATE TRIGGER trg_security_settings_updated_at
BEFORE UPDATE ON security_settings
FOR EACH ROW
EXECUTE FUNCTION nova_set_updated_at();
`,

/* ============================================================
 * Schema Version
 * ============================================================ */

`
CREATE TABLE IF NOT EXISTS nova_schema_version (
  id INTEGER PRIMARY KEY,
  version VARCHAR(30) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,

`
INSERT INTO nova_schema_version (
  id,
  version
)
VALUES (
  1,
  '1.0.0'
)
ON CONFLICT (id)
DO UPDATE SET
  version = EXCLUDED.version,
  applied_at = NOW();
`

];

/* ============================================================
 * Database Setup
 * ============================================================ */

async function setupDatabase() {
  const client = new Client(config);

  try {
    log('جاري الاتصال بـ PostgreSQL...');

    await client.connect();

    log('تم الاتصال بقاعدة البيانات.');

    await client.query('BEGIN');

    for (let index = 0; index < SQL.length; index += 1) {
      const statement = SQL[index];

      if (!statement || !statement.trim()) {
        continue;
      }

      log(
        `تنفيذ خطوة قاعدة البيانات ${index + 1}/${SQL.length}...`
      );

      await client.query(statement);
    }

    await client.query('COMMIT');

    log('تم إنشاء هيكل قاعدة NOVA بنجاح.');

    const result = await client.query(`
      SELECT
        COUNT(*)::INTEGER AS table_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
    `);

    const tableCount =
      result.rows[0]?.table_count || 0;

    console.log('');
    console.log('========================================');
    console.log(' NOVA DATABASE READY');
    console.log('========================================');
    console.log('');
    console.log(
      `عدد الجداول الموجودة: ${tableCount}`
    );
    console.log(
      'الإصدار: 1.0.0'
    );
    console.log(
      'البيانات التجريبية: لا يوجد'
    );
    console.log(
      'الحالة: Database schema ready'
    );
    console.log('');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    fail(
      'فشل إنشاء قاعدة بيانات NOVA.',
      error
    );

    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

/* ============================================================
 * Direct execution
 * ============================================================ */

if (require.main === module) {
  setupDatabase()
    .then(() => {
      process.exitCode = 0;
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

/* ============================================================
 * Export
 * ============================================================ */

module.exports = {
  setupDatabase,
  config,
};
