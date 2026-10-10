using Microsoft.EntityFrameworkCore;
using Timesheet.Data;
using Timesheet.Infrastructure;
using Timesheet.Models;

namespace Timesheet.Endpoints;

public static class ClientEndpoints
{
    public static void MapClientEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/clients").RequireAuthorization();

        group.MapGet("/", async (ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            return await db.Clients.Where(c => c.UserId == userId)
                .OrderBy(c => c.Name)
                .Select(c => new ClientDto(c.Id, c.Name, c.Archived))
                .ToListAsync();
        });

        group.MapPost("/", async (ClientRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest("Namn krävs.");

            var client = new Client { UserId = context.User.UserId(), Name = request.Name.Trim(), Archived = request.Archived };
            db.Clients.Add(client);
            await db.SaveChangesAsync();
            return Results.Ok(new ClientDto(client.Id, client.Name, client.Archived));
        });

        group.MapPut("/{id:int}", async (int id, ClientRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest("Namn krävs.");

            var userId = context.User.UserId();
            var client = await db.Clients.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);
            if (client == null) return Results.NotFound();

            client.Name = request.Name.Trim();
            client.Archived = request.Archived;
            await db.SaveChangesAsync();
            return Results.Ok(new ClientDto(client.Id, client.Name, client.Archived));
        });

        // Projects keep their entries; they just lose the client.
        group.MapDelete("/{id:int}", async (int id, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var deleted = await db.Clients.Where(c => c.Id == id && c.UserId == userId).ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    public record ClientDto(int Id, string Name, bool Archived);
    public record ClientRequest(string Name, bool Archived);
}
