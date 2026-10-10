using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace Timesheet.Services;

// Sends the verification and password-reset mails over SMTP. Credentials and
// From-address live in config under Email:Smtp:* and Email:From / Email:FromName.
// Without SMTP config the link is only logged — enough for local development.
public class EmailService(IConfiguration config, ILogger<EmailService> logger)
{
    public Task SendEmailVerificationAsync(string toEmail, string link) => SendAsync(toEmail,
        "Bekräfta din e-postadress – timesheet",
        Card("Klicka på knappen nedan för att bekräfta din e-postadress. Länken är giltig i 24 timmar.",
             "Bekräfta e-postadress", link,
             "Om du inte skapade ett konto kan du ignorera mailet."),
        link);

    public Task SendPasswordResetAsync(string toEmail, string link) => SendAsync(toEmail,
        "Återställ ditt lösenord – timesheet",
        Card("Klicka på knappen nedan för att välja ett nytt lösenord. Länken är giltig i 1 timme.",
             "Återställ lösenord", link,
             "Om du inte begärde detta kan du ignorera mailet."),
        link);

    private static string Card(string paragraph, string buttonLabel, string buttonLink, string footer) => $"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border:1px solid #e8e8e8;border-radius:8px">
          <p style="font-size:20px;font-weight:700;margin:0 0 24px">timesheet</p>
          <p style="font-size:14px;color:#333">{paragraph}</p>
          <a href="{buttonLink}" style="display:inline-block;margin:20px 0;padding:10px 24px;background:#111;color:#fff;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600">{buttonLabel}</a>
          <p style="font-size:11px;color:#aaa;margin-top:24px">{footer}</p>
        </div>
        """;

    private async Task SendAsync(string toEmail, string subject, string htmlBody, string link)
    {
        var email = config.GetSection("Email");
        var host = email["Smtp:Host"];
        var user = email["Smtp:Username"];
        var pass = email["Smtp:Password"];

        if (string.IsNullOrEmpty(host) || string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass))
        {
            logger.LogWarning("Email not configured — link for {Email}: {Link}", toEmail, link);
            return;
        }

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(email["FromName"] ?? "timesheet", email["From"] ?? user));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = subject;
        message.Body = new TextPart("html") { Text = htmlBody };

        using var smtp = new SmtpClient();
        await smtp.ConnectAsync(host, int.Parse(email["Smtp:Port"] ?? "465"), SecureSocketOptions.Auto);
        await smtp.AuthenticateAsync(user, pass);
        await smtp.SendAsync(message);
        await smtp.DisconnectAsync(true);
    }
}
