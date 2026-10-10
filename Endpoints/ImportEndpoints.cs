using Timesheet.Infrastructure;
using Timesheet.Services;

namespace Timesheet.Endpoints;

public static class ImportEndpoints
{
    public static void MapImportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/import/clockify").RequireAuthorization();

        // First step: which workspaces the key can see, so the user can pick one.
        group.MapPost("/workspaces", async (ClockifyKeyRequest request, ClockifyImportService clockify, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.ApiKey)) return Results.BadRequest("API-nyckel krävs.");
            try
            {
                return Results.Ok(await clockify.GetWorkspacesAsync(request.ApiKey.Trim(), ct));
            }
            catch (ClockifyException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        group.MapPost("/", async (ClockifyImportRequest request, ClockifyImportService clockify, HttpContext context, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.ApiKey) || string.IsNullOrWhiteSpace(request.WorkspaceId))
                return Results.BadRequest("API-nyckel och workspace krävs.");
            try
            {
                return Results.Ok(await clockify.ImportAsync(context.User.UserId(), request.ApiKey.Trim(), request.WorkspaceId, ct));
            }
            catch (ClockifyException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });
    }

    public record ClockifyKeyRequest(string ApiKey);
    public record ClockifyImportRequest(string ApiKey, string WorkspaceId);
}
