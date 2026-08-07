/**
 * RE Workspace — Email Service
 * Uses Cloudflare Email Service native Workers binding (send_email).
 * Domain: primeamericarealestate.com (already configured ✅)
 */

interface EmailBinding {
  send(message: EmailMessage): Promise<void>
}

interface EmailMessage {
  to: { email: string; name?: string }[]
  from: { email: string; name: string }
  subject: string
  text: string
  html: string
}

const FROM = {
  email: 'noreply@primeamericarealestate.com',
  name: 'Prime America Real Estate',
}

function baseHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F7F6F2; color: #28251D; }
    .wrap { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #E8E6E1; }
    .header { background: #01696F; padding: 32px 36px; }
    .header h1 { margin: 0; color: #fff; font-size: 22px; font-weight: 600; }
    .header p { margin: 4px 0 0; color: rgba(255,255,255,0.75); font-size: 13px; }
    .body { padding: 32px 36px; }
    .body p { line-height: 1.6; color: #4A4740; margin: 0 0 16px; }
    .btn { display: inline-block; background: #01696F; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0 20px; }
    .note { font-size: 12px; color: #7A7974; }
    .footer { padding: 20px 36px; border-top: 1px solid #E8E6E1; font-size: 12px; color: #7A7974; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>Prime America Real Estate</h1>
      <p>RE Workspace</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">Prime America Real Estate · RE Workspace · New York</div>
  </div>
</body>
</html>`
}

// ── Email Senders ────────────────────────────────────────────────────────────

export async function sendVerificationEmail(
  email: EmailBinding,
  to: string,
  name: string,
  token: string,
  baseUrl: string,
): Promise<void> {
  const link = `${baseUrl}/verify-email?token=${token}`
  await email.send({
    to: [{ email: to, name }],
    from: FROM,
    subject: 'Verify your RE Workspace email',
    text: `Hi ${name},\n\nPlease verify your email by visiting:\n${link}\n\nThis link expires in 24 hours.\n\n— Prime America Real Estate`,
    html: baseHtml(
      'Verify your email',
      `<p>Hi ${name},</p>
       <p>Welcome to RE Workspace! Please verify your email address to activate your account.</p>
       <a href="${link}" class="btn">Verify Email Address</a>
       <p class="note">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>`,
    ),
  })
}

export async function sendPasswordResetEmail(
  email: EmailBinding,
  to: string,
  name: string,
  token: string,
  baseUrl: string,
): Promise<void> {
  const link = `${baseUrl}/reset-password?token=${token}`
  await email.send({
    to: [{ email: to, name }],
    from: FROM,
    subject: 'Reset your RE Workspace password',
    text: `Hi ${name},\n\nReset your password by visiting:\n${link}\n\nThis link expires in 1 hour.\n\n— Prime America Real Estate`,
    html: baseHtml(
      'Reset your password',
      `<p>Hi ${name},</p>
       <p>We received a request to reset your RE Workspace password.</p>
       <a href="${link}" class="btn">Reset Password</a>
       <p class="note">This link expires in 1 hour. If you didn't request a reset, your password is unchanged.</p>`,
    ),
  })
}

export async function sendInvitationEmail(
  email: EmailBinding,
  to: string,
  inviteeName: string | null,
  inviterName: string,
  tenantName: string,
  role: string,
  token: string,
  baseUrl: string,
): Promise<void> {
  const link = `${baseUrl}/accept-invite?token=${token}`
  const greeting = inviteeName ? `Hi ${inviteeName},` : 'Hello,'
  await email.send({
    to: [{ email: to, name: inviteeName ?? undefined }],
    from: FROM,
    subject: `You're invited to join ${tenantName} on RE Workspace`,
    text: `${greeting}\n\n${inviterName} has invited you to join ${tenantName} as a ${role}.\n\nAccept your invitation:\n${link}\n\nThis link expires in 7 days.\n\n— Prime America Real Estate`,
    html: baseHtml(
      `You're invited to ${tenantName}`,
      `<p>${greeting}</p>
       <p><strong>${inviterName}</strong> has invited you to join <strong>${tenantName}</strong> on RE Workspace as a <strong>${role}</strong>.</p>
       <a href="${link}" class="btn">Accept Invitation</a>
       <p class="note">This link expires in 7 days. If you weren't expecting this invitation, you can safely ignore it.</p>`,
    ),
  })
}

export async function sendWelcomeEmail(
  email: EmailBinding,
  to: string,
  name: string,
): Promise<void> {
  await email.send({
    to: [{ email: to, name }],
    from: FROM,
    subject: 'Welcome to RE Workspace!',
    text: `Hi ${name},\n\nYour account is verified and ready. Sign in at your workspace URL.\n\n— Prime America Real Estate`,
    html: baseHtml(
      'Welcome to RE Workspace',
      `<p>Hi ${name},</p>
       <p>Your RE Workspace account is verified and ready to use. You now have access to your personalized command center.</p>
       <p>Sign in to get started:</p>
       <a href="https://re-workspace.lama-4db.workers.dev/login" class="btn">Open RE Workspace</a>`,
    ),
  })
}

export async function sendManualUserWelcomeEmail(
  email: EmailBinding,
  to: string,
  name: string,
  tempPassword: string,
  tenantName: string,
  baseUrl: string,
): Promise<void> {
  const loginLink = `${baseUrl}/login`
  await email.send({
    to: [{ email: to, name }],
    from: FROM,
    subject: `Your RE Workspace account for ${tenantName} is ready`,
    text: `Hi ${name},\n\nAn account has been created for you at ${tenantName}.\n\nAccess details:\nURL: ${loginLink}\nEmail: ${to}\nTemporary Password: ${tempPassword}\n\nPlease sign in and change your password.\n\n— Prime America Real Estate`,
    html: baseHtml(
      'Account Ready',
      `<p>Hi ${name},</p>
       <p>An account has been created for you at <strong>${tenantName}</strong> on RE Workspace.</p>
       <p><strong>Your Access Information:</strong></p>
       <div style="background: #F7F6F2; padding: 16px; border-radius: 8px; margin: 16px 0; font-family: monospace; font-size: 14px; color: #28251D;">
         <strong>Workspace URL:</strong> <a href="${loginLink}">${loginLink}</a><br/>
         <strong>Email:</strong> ${to}<br/>
         <strong>Temporary Password:</strong> ${tempPassword}
       </div>
       <p>For security, please sign in and update your password immediately in Settings.</p>
       <a href="${loginLink}" class="btn">Sign In Now</a>`
    )
  })
}

export async function sendComplianceNotificationEmail(
  email: EmailBinding,
  brokerEmail: string,
  brokerName: string,
  agentName: string,
  dealName: string,
  taskTitle: string,
  documentKey: string,
  baseUrl: string
): Promise<void> {
  const deskLink = `${baseUrl}/transactions/desk`
  await email.send({
    to: [{ email: brokerEmail, name: brokerName }],
    from: FROM,
    subject: `[Compliance Review] New document submitted for ${dealName}`,
    text: `Hi ${brokerName},\n\nAgent ${agentName} has uploaded a compliance document for task "${taskTitle}" on deal "${dealName}".\n\nPlease review it at the compliance desk:\n${deskLink}\n\n— Prime America Real Estate`,
    html: baseHtml(
      'Compliance Review Request',
      `<p>Hi ${brokerName},</p>
       <p>Agent <strong>${agentName}</strong> has uploaded a compliance document for task "<strong>${taskTitle}</strong>" on deal "<strong>${dealName}</strong>".</p>
       <p>Please review and approve or reject the document at the Transaction Compliance Desk:</p>
       <a href="${deskLink}" class="btn">Open Compliance Desk</a>
       <p class="note"><strong>Document File:</strong> ${documentKey}</p>`
    )
  })
}

export async function sendDeadlineWarningEmail(
  email: EmailBinding,
  agentEmail: string,
  agentName: string,
  dealName: string,
  taskTitle: string,
  dueDate: string,
  baseUrl: string
): Promise<void> {
  const dealLink = `${baseUrl}/transactions`
  await email.send({
    to: [{ email: agentEmail, name: agentName }],
    from: FROM,
    subject: `🚨 [Reminder] Upcoming Deadline: "${taskTitle}" for ${dealName}`,
    text: `Hi ${agentName},\n\nThis is an automated reminder that the task "${taskTitle}" for deal "${dealName}" is due on ${dueDate}.\n\nPlease complete it here: ${dealLink}\n\n— Prime America Real Estate`,
    html: baseHtml(
      'Upcoming Deadline Alert',
      `<p>Hi ${agentName},</p>
       <p>This is an automated reminder that the task "<strong>${taskTitle}</strong>" for deal "<strong>${dealName}</strong>" is approaching its deadline.</p>
       <div style="background: #FFFBEB; border: 1px solid #FDE68A; color: #78350F; padding: 16px; border-radius: 8px; margin: 16px 0;">
         <strong>Task:</strong> ${taskTitle}<br/>
         <strong>Due Date:</strong> ${dueDate} (Within 48 hours)
       </div>
       <p>Please complete this task and attach any required compliance files:</p>
       <a href="${dealLink}" class="btn">View Checklist</a>`
    )
  })
}
