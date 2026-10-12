using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Timesheet.Migrations
{
    /// <inheritdoc />
    public partial class DefaultProject : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DefaultProjectId",
                table: "Users",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_DefaultProjectId",
                table: "Users",
                column: "DefaultProjectId");

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Projects_DefaultProjectId",
                table: "Users",
                column: "DefaultProjectId",
                principalTable: "Projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Users_Projects_DefaultProjectId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_DefaultProjectId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "DefaultProjectId",
                table: "Users");
        }
    }
}
