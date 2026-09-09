using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace GreyZone.Server.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<LevelProgress> LevelProgress => Set<LevelProgress>();
    public DbSet<GameLog> GameLogs => Set<GameLog>();
    public DbSet<GameLogPlayer> GameLogPlayers => Set<GameLogPlayer>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // SQLite stores DateTime as text without an offset; mark everything we read back as UTC.
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.ToTable("Users");
            e.HasKey(u => u.Id);
            e.Property(u => u.Username).HasMaxLength(20).IsRequired();
            e.Property(u => u.NormalizedUsername).HasMaxLength(20).IsRequired();
            e.Property(u => u.PasswordHash).IsRequired();
            e.HasIndex(u => u.NormalizedUsername).IsUnique();
        });

        modelBuilder.Entity<LevelProgress>(e =>
        {
            e.ToTable("LevelProgress");
            e.HasKey(p => p.Id);
            e.Property(p => p.LevelId).HasMaxLength(100).IsRequired();
            e.HasIndex(p => new { p.UserId, p.LevelId }).IsUnique();
            e.HasOne(p => p.User).WithMany().HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GameLog>(e =>
        {
            e.ToTable("GameLogs");
            e.HasKey(g => g.Id);
            e.Property(g => g.Mode).HasMaxLength(20).IsRequired();
            e.Property(g => g.LevelId).HasMaxLength(100);
            e.Property(g => g.Result).HasMaxLength(64);
            e.HasIndex(g => g.StartedAt);
            e.HasMany(g => g.Players).WithOne(p => p.GameLog).HasForeignKey(p => p.GameLogId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GameLogPlayer>(e =>
        {
            e.ToTable("GameLogPlayers");
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.UserId);
            e.HasOne(p => p.User).WithMany().HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}

internal sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    v => v,
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
