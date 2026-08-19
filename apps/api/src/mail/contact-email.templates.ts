export type ContactInquiryPayload = {
  schoolName: string;
  mobile: string;
  email?: string | null;
  message?: string | null;
  inquiryId: string;
};

const SITE_URL = 'https://id.vbdigital.tech';
const BRAND = 'VB Digital ID Cards';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${BRAND}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#eef2f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe3ef;box-shadow:0 8px 30px rgba(15,23,42,0.08);">
          <tr>
            <td style="height:5px;background:linear-gradient(90deg,#0ea5e9,#fbbf24,#22c55e,#f43f5e,#8b5cf6);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#0b1f3a;padding:28px 32px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">VB Digital</p>
              <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;font-weight:500;">School ID Card Management Platform</p>
            </td>
          </tr>
          ${content}
          <tr>
            <td style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:12px;color:#64748b;line-height:1.6;">
                © ${new Date().getFullYear()} VB Digital · Smart school ID card operations
              </p>
              <p style="margin:0;font-size:12px;color:#64748b;">
                <a href="${SITE_URL}" style="color:#2563eb;text-decoration:none;">${SITE_URL.replace('https://', '')}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildContactInquiryAdminEmail(data: ContactInquiryPayload) {
  const message = data.message?.trim() || '—';
  const submitterEmail = data.email?.trim() || '—';
  const submittedAt = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  const text = [
    'New school contact inquiry',
    '',
    `School: ${data.schoolName}`,
    `Mobile: ${data.mobile}`,
    `Email: ${submitterEmail}`,
    '',
    'Message:',
    message,
    '',
    `Reference: ${data.inquiryId}`,
    `Submitted: ${submittedAt}`,
  ].join('\n');

  const html = emailShell(`
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb;">New inquiry</p>
              <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">School contact request</h1>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;"><strong style="color:#334155;">School:</strong> ${escapeHtml(data.schoolName)}</p>
                    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;"><strong style="color:#334155;">Mobile:</strong> ${escapeHtml(data.mobile)}</p>
                    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;"><strong style="color:#334155;">Email:</strong> ${escapeHtml(submitterEmail)}</p>
                    <p style="margin:0;font-size:14px;line-height:1.6;"><strong style="color:#334155;">Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:12px;color:#64748b;">Reference <strong style="color:#475569;">${escapeHtml(data.inquiryId)}</strong> · ${escapeHtml(submittedAt)}</p>
            </td>
          </tr>`);

  return {
    subject: `New inquiry: ${data.schoolName}`,
    text,
    html,
  };
}

export function buildContactThankYouEmail(data: ContactInquiryPayload) {
  const submittedAt = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const school = escapeHtml(data.schoolName);
  const ref = escapeHtml(data.inquiryId.slice(0, 8).toUpperCase());

  const text = [
    `Dear ${data.schoolName} team,`,
    '',
    'Thank you for reaching out to VB Digital ID Cards.',
    '',
    'We have received your inquiry and our team will review the details shortly. A member of our team will contact you on your registered mobile number or email within 1–2 business days.',
    '',
    'Your submission summary:',
    `- School: ${data.schoolName}`,
    `- Mobile: ${data.mobile}`,
    data.email ? `- Email: ${data.email}` : '',
    data.message?.trim() ? `- Message: ${data.message.trim()}` : '',
    '',
    `Reference number: ${data.inquiryId.slice(0, 8).toUpperCase()}`,
    `Submitted: ${submittedAt}`,
    '',
    `Visit us: ${SITE_URL}`,
    '',
    'Warm regards,',
    'VB Digital Team',
    'School ID Card Management',
  ]
    .filter(Boolean)
    .join('\n');

  const html = emailShell(`
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb;">Thank you</p>
              <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">We received your inquiry</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">
                Dear <strong style="color:#0f172a;">${school}</strong> team,
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">
                Thank you for contacting <strong style="color:#0f172a;">VB Digital ID Cards</strong>. We have received your message and our team is reviewing your request.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1d4ed8;">What happens next</p>
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#334155;">
                      Our team will reach out to you on your registered mobile or email within <strong>1–2 business days</strong> to discuss ID card setup, templates, and onboarding for your school.
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#334155;">Your submission</p>
                    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#475569;"><strong>School:</strong> ${school}</p>
                    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#475569;"><strong>Mobile:</strong> ${escapeHtml(data.mobile)}</p>
                    ${data.email ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#475569;"><strong>Email:</strong> ${escapeHtml(data.email)}</p>` : ''}
                    ${data.message?.trim() ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#475569;"><strong>Message:</strong><br>${escapeHtml(data.message.trim()).replace(/\n/g, '<br>')}</p>` : ''}
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 8px;font-size:13px;color:#64748b;">
                Reference <strong style="color:#475569;letter-spacing:0.06em;">${ref}</strong> · ${escapeHtml(submittedAt)}
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;">
                <tr>
                  <td style="border-radius:10px;background-color:#2563eb;">
                    <a href="${SITE_URL}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Visit VB Digital</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:14px;line-height:1.7;color:#475569;">
                Warm regards,<br>
                <strong style="color:#0f172a;">VB Digital Team</strong><br>
                <span style="color:#64748b;">School ID Card Management</span>
              </p>
            </td>
          </tr>`);

  return {
    subject: 'Thank you for contacting VB Digital ID Cards',
    text,
    html,
  };
}
