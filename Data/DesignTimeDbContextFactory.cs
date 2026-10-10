using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Timesheet.Data;

// `dotnet ef migrations add` never connects, so a placeholder connection string is enough.
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("DefaultConnection") ?? "Host=localhost;Database=timesheet")
            .Options;
        return new ApplicationDbContext(options);
    }
}
