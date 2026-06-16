const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'River Stone Wyoming <noreply@RiverStoneWyoming.com>';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

// ---------- Shared Premium Email Wrapper ----------
const wrapEmail = ({ title, preheader, content, actionUrl, actionText, ctaColor }) => {
  const colorPrimary = '#6366f1';
  const colorSuccess = '#10b981';
  const colorDanger  = '#ef4444';
  const bgDark   = '#0f172a';
  const bgCard   = '#1e293b';
  const textLight = '#e2e8f0';
  const textMuted = '#94a3b8';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:${bgDark}; font-family:system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <!-- Preheader -->
  <div style="display:none; max-height:0; overflow:hidden;">${preheader}</div>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${bgDark}; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:${bgCard}; border-radius:16px; overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.3);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${colorPrimary}, #06b6d4); padding:30px 40px; text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:28px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">
                    RiverStoneWyoming<span style="color:#e0e7ff;"> Business</span>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:18px; color:#e0e7ff; padding-top:8px;">${title}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px; color:${textLight}; font-size:16px; line-height:1.6;">
              ${content}

              ${actionUrl ? `
              <div style="text-align:center; margin:30px 0;">
                <a href="${actionUrl}" style="display:inline-block; background-color:${ctaColor || colorPrimary}; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:8px; font-weight:600; font-size:16px;">${actionText || 'Go to Dashboard'}</a>
              </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:rgba(0,0,0,0.2); padding:20px 40px; text-align:center; font-size:12px; color:${textMuted};">
              <p style="margin:0 0 8px;">© ${new Date().getFullYear()} River Stone Wyoming. All rights reserved.</p>
              <p style="margin:0;">This email was sent to you because you have an account with River Stone Wyoming.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ---------- Email Templates (Premium) ----------
const emailTemplates = {
  welcome: (name) => ({
    subject: 'Welcome to River Stone Wyoming',
    html: wrapEmail({
      title: 'Welcome',
      preheader: 'Your crypto LLC journey starts now.',
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your email has been verified successfully. You now have full access to your account.</p>
        <p>Here’s what you can do next:</p>
        <ul>
          <li>Complete your <strong>KYC verification</strong> to unlock LLC filing and wallet creation.</li>
          <li>Start an <strong>LLC application</strong> for your crypto business.</li>
          <li>Create a <strong>secure crypto wallet</strong> (once your LLC is approved).</li>
        </ul>
      `,
      actionUrl: `${BASE_URL}/user/dashboard`,
      actionText: 'Go to Dashboard'
    })
  }),

  verificationCode: (name, code) => ({
    subject: 'Verify Your Email - River Stone Wyoming',
    html: wrapEmail({
      title: 'Email Verification',
      preheader: 'Your verification code is inside.',
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Please use the following code to verify your email address:</p>
        <div style="background:rgba(99,102,241,0.1); border:1px solid #6366f1; border-radius:12px; padding:20px; text-align:center; margin:25px 0;">
          <span style="font-size:32px; font-weight:700; letter-spacing:6px; color:#6366f1;">${code}</span>
        </div>
        <p>This code expires in <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
      `
    })
  }),

  llcSubmitted: (name, llcName) => ({
    subject: 'LLC Application Received - River Stone Wyoming',
    html: wrapEmail({
      title: 'Application Received',
      preheader: `We've received your LLC application for ${llcName}.`,
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>We have received your LLC application for <strong>${llcName}</strong>.</p>
        <p>Your application is now <span style="color:#f59e0b; font-weight:600;">pending review</span>. You will receive another email once your LLC is approved by the state.</p>
        <p>Processing time is based on your selected plan.</p>
      `,
      actionUrl: `${BASE_URL}/user/dashboard`,
      actionText: 'View Application Status'
    })
  }),

  llcApproved: (name, llcName) => ({
    subject: 'LLC Approved - River Stone Wyoming',
    html: wrapEmail({
      title: 'LLC Approved!',
      preheader: `Congratulations! Your LLC ${llcName} has been approved.`,
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Congratulations! Your LLC <strong>${llcName}</strong> has been <span style="color:#10b981; font-weight:600;">approved</span>.</p>
        <p>You now have access to:</p>
        <ul>
          <li>Your official formation documents</li>
          <li>Employer ID Number (EIN)</li>
          <li>Operating Agreement</li>
          <li><strong>Crypto Wallet Creation</strong></li>
        </ul>
      `,
      actionUrl: `${BASE_URL}/user/dashboard`,
      actionText: 'Access Your Dashboard',
      ctaColor: '#10b981'
    })
  }),

  llcRejected: (name, llcName, reason) => ({
    subject: 'LLC Application Update - River Stone Wyoming',
    html: wrapEmail({
      title: 'Application Needs Attention',
      preheader: `Your LLC ${llcName} requires additional attention.`,
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your LLC application for <strong>${llcName}</strong> requires additional attention.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Please log in to your dashboard to review and resubmit your application.</p>
      `,
      actionUrl: `${BASE_URL}/user/dashboard`,
      actionText: 'Review Application',
      ctaColor: '#ef4444'
    })
  }),

  walletCreated: (name, walletAddress) => ({
    subject: 'Crypto Wallet Created - River Stone Wyoming',
    html: wrapEmail({
      title: 'Wallet Created',
      preheader: 'Your crypto wallet is now active.',
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your crypto wallet has been created and linked to your approved LLC.</p>
        <div style="background:rgba(99,102,241,0.1); border:1px solid #6366f1; border-radius:12px; padding:20px; margin:25px 0;">
          <p style="margin:0 0 8px; font-size:14px; color:#94a3b8;">Wallet Address</p>
          <p style="font-family:monospace; font-size:16px; margin:0; word-break:break-all;">${walletAddress}</p>
        </div>
        <p style="color:#f59e0b; font-weight:600;">⚠️ IMPORTANT: Your recovery phrase was displayed only once during creation. If you did not save it, you may lose access to your wallet.</p>
      `,
      actionUrl: `${BASE_URL}/user/wallet`,
      actionText: 'View Wallet'
    })
  }),

  balanceAdded: (name, amount, reason, newBalance) => ({
    subject: 'Balance Added to Your Crypto Wallet',
    html: wrapEmail({
      title: 'Balance Added',
      preheader: `${amount} USD has been added to your wallet.`,
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p><strong>$${amount.toLocaleString()}</strong> has been added to your wallet balance.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Your new total balance (Profit) is <strong>$${newBalance.toLocaleString()}</strong>.</p>
      `,
      actionUrl: `${process.env.BASE_URL}/user/wallet`,
      actionText: 'View Wallet'
    })
  }),

  withdrawalSubmitted: (name, amount, chain, toAddress) => ({
    subject: 'Withdrawal Request Submitted - River Stone Wyoming',
    html: wrapEmail({
      title: 'Withdrawal Request Received',
      preheader: `Your withdrawal request for $${amount} on ${chain.toUpperCase()} has been submitted.`,
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your withdrawal request has been received:</p>
        <ul>
          <li><strong>Amount:</strong> $${amount.toLocaleString()}</li>
          <li><strong>Chain:</strong> ${chain.toUpperCase()}</li>
          <li><strong>Destination Address:</strong> ${toAddress}</li>
        </ul>
        <p>Your request is pending review. You will be notified once it is processed.</p>
      `,
      actionUrl: `${BASE_URL}/user/wallet`,
      actionText: 'View Wallet'
    })
  }),
  
  withdrawalApproved: (name, amount, chain) => ({
    subject: 'Withdrawal Approved - River Stone Wyoming',
    html: wrapEmail({
      title: 'Withdrawal Approved',
      preheader: `Your withdrawal of $${amount} on ${chain.toUpperCase()} has been approved.`,
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your withdrawal request for <strong>$${amount.toLocaleString()}</strong> on <strong>${chain.toUpperCase()}</strong> has been <span style="color:#10b981;">approved</span>.</p>
        <p>The funds should be sent to your destination address shortly.</p>
      `,
      actionUrl: `${BASE_URL}/user/wallet`,
      actionText: 'View Wallet',
      ctaColor: '#10b981'
    })
  }),
  
  withdrawalRejected: (name, amount, chain, reason) => ({
    subject: 'Withdrawal Rejected - River Stone Wyoming',
    html: wrapEmail({
      title: 'Withdrawal Rejected',
      preheader: `Your withdrawal of $${amount} on ${chain.toUpperCase()} was not approved.`,
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your withdrawal request for <strong>$${amount.toLocaleString()}</strong> on <strong>${chain.toUpperCase()}</strong> has been <span style="color:#ef4444;">rejected</span>.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Please contact support if you have questions.</p>
      `,
      actionUrl: `${BASE_URL}/user/wallet`,
      actionText: 'View Wallet',
      ctaColor: '#ef4444'
    })
  }),

  kycApproved: (name) => ({
    subject: 'KYC Verification Approved - River Stone Wyoming',
    html: wrapEmail({
      title: 'KYC Approved',
      preheader: 'Your identity has been verified.',
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your KYC documents have been <span style="color:#10b981; font-weight:600;">approved</span>. You now have full access to all platform features, including LLC filing and wallet creation.</p>
      `,
      actionUrl: `${BASE_URL}/user/dashboard`,
      actionText: 'Go to Dashboard',
      ctaColor: '#10b981'
    })
  }),

  kycRejected: (name, reason) => ({
    subject: 'KYC Verification Update - River Stone Wyoming',
    html: wrapEmail({
      title: 'KYC Needs Attention',
      preheader: 'Your KYC submission was not approved.',
      content: `
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your KYC submission was not approved.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Please log in to resubmit your documents.</p>
      `,
      actionUrl: `${BASE_URL}/user/kyc`,
      actionText: 'Resubmit Documents',
      ctaColor: '#ef4444'
    })
  })
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      html: html,
      text: text || ''
    });

    if (error) {
      console.error('Email send error:', error);
      return { success: false, error };
    }

    console.log('Email sent:', data.id);
    return { success: true, data };
  } catch (error) {
    console.error('Email service error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail, emailTemplates };