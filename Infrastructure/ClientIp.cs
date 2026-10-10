namespace Timesheet.Infrastructure;

public static class ClientIp
{
    // Trust CF-Connecting-IP only because the origin is locked down to accept Cloudflare traffic
    // exclusively; if the origin is ever exposed directly this header becomes spoofable.
    public static string GetClientIp(HttpContext context)
    {
        var cfIp = context.Request.Headers["CF-Connecting-IP"].ToString();
        if (!string.IsNullOrEmpty(cfIp))
            return cfIp;

        return context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }
}
