const Command = require("../../structures/Command");
const prisma = require("../../config/prisma");
const { EmbedBuilder, Colors } = require("discord.js");
const BattleChannelManager = require("../../services/BattleChannelManager");

// Emoji indicators
const checkMark = "✅";
const crossMark = "❌";
const newMark = "🆕";

module.exports = new Command({
  name: "setup",
  description: "Configure guild settings",
  category: "admin",
  permissions: ["ADMINISTRATOR"],
  cooldown: 5,
  async execute(message, args, handler) {
    const isSlash = message.commandName === "setup";

    try {
      // Get parameters based on command type
      let guildId, guildName, verifiedRole, tankRole, healerRole, supportRole;
      let meleeRole, rangedRole, mountRole, prefix, language;
      let battlelogChannel, webhookUrl;
      let minTotalPlayers, minGuildPlayers;

      if (isSlash) {
        language = message.options.getString("language");
        guildId = message.options.getString("guild_id");
        guildName = message.options.getString("guild_name");
        verifiedRole = message.options.getRole("verified_role");
        tankRole = message.options.getRole("tank_role");
        healerRole = message.options.getRole("healer_role");
        supportRole = message.options.getRole("support_role");
        meleeRole = message.options.getRole("melee_role");
        rangedRole = message.options.getRole("ranged_role");
        mountRole = message.options.getRole("mount_role");
        prefix = message.options.getString("prefix");
        battlelogChannel = message.options.getChannel("battlelog_channel");
        webhookUrl = message.options.getString("battlelog_webhook");
        minTotalPlayers = message.options.getInteger("min_total_players");
        minGuildPlayers = message.options.getInteger("min_guild_players");
      }

      // Verify we're in the correct Discord server
      if (!message.guild || !message.guildId) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("This command can only be used in a Discord server.")
          .setColor(Colors.Red);

        if (isSlash) {
          await message.reply({ embeds: [errorEmbed], ephemeral: true });
        } else {
          await message.reply({ embeds: [errorEmbed] });
        }
        return;
      }

      // Get current settings
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: message.guildId },
      });

      // Update settings with new values if provided
      const updateData = {
        guildId: message.guildId,
        guildName: guildName || settings?.guildName || message.guild.name,
        language: language || settings?.language || "en",
        albionGuildId: guildId || settings?.albionGuildId,
        nicknameVerifiedId: verifiedRole?.id || settings?.nicknameVerifiedId,
        tankRoleId: tankRole?.id || settings?.tankRoleId,
        healerRoleId: healerRole?.id || settings?.healerRoleId,
        supportRoleId: supportRole?.id || settings?.supportRoleId,
        dpsMeleeRoleId: meleeRole?.id || settings?.dpsMeleeRoleId,
        dpsRangedRoleId: rangedRole?.id || settings?.dpsRangedRoleId,
        battlemountRoleId: mountRole?.id || settings?.battlemountRoleId,
        commandPrefix: prefix || settings?.commandPrefix,
        battlelogChannelId:
          battlelogChannel?.id || settings?.battlelogChannelId,
        battlelogWebhook: webhookUrl || settings?.battlelogWebhook,
        minTotalPlayers: minTotalPlayers || settings?.minTotalPlayers || 20,
        minGuildPlayers: minGuildPlayers || settings?.minGuildPlayers || 14,
      };

      // Update database
      await prisma.guildSettings.upsert({
        where: { guildId: message.guildId },
        update: updateData,
        create: updateData,
      });

      // Update battle channel name if it exists and was provided
      if (
        battlelogChannel &&
        battlelogChannel?.id !== settings?.battlelogChannelId
      ) {
        const channelManager = new BattleChannelManager(message.client);
        await channelManager.updateGuildChannel({
          guildId: message.guildId,
          battlelogChannelId: battlelogChannel.id,
        });
      }

      // Create response embed
      const setupEmbed = new EmbedBuilder()
        .setTitle("🛠️ Guild Configuration Status")
        .addFields([
          {
            name: "Required Settings",
            value: [
              `Guild ID: ${
                updateData.albionGuildId
                  ? `${guildId ? newMark : checkMark} ${
                      updateData.albionGuildId
                    }`
                  : `${crossMark} Not Set`
              }`,
              `Guild Name: ${
                updateData.guildName
                  ? `${guildName ? newMark : checkMark} ${updateData.guildName}`
                  : `${crossMark} Not Set`
              }`,
              `Verified Role: ${
                updateData.nicknameVerifiedId
                  ? `${verifiedRole ? newMark : checkMark} <@&${
                      updateData.nicknameVerifiedId
                    }>`
                  : `${crossMark} Not Set`
              }`,
            ].join("\n"),
          },
          {
            name: "Role Configuration",
            value: [
              `Tank Role: ${
                updateData.tankRoleId
                  ? `${tankRole ? newMark : checkMark} <@&${
                      updateData.tankRoleId
                    }>`
                  : `${crossMark} Not Set`
              }`,
              `Healer Role: ${
                updateData.healerRoleId
                  ? `${healerRole ? newMark : checkMark} <@&${
                      updateData.healerRoleId
                    }>`
                  : `${crossMark} Not Set`
              }`,
              `Support Role: ${
                updateData.supportRoleId
                  ? `${supportRole ? newMark : checkMark} <@&${
                      updateData.supportRoleId
                    }>`
                  : `${crossMark} Not Set`
              }`,
              `Melee DPS Role: ${
                updateData.dpsMeleeRoleId
                  ? `${meleeRole ? newMark : checkMark} <@&${
                      updateData.dpsMeleeRoleId
                    }>`
                  : `${crossMark} Not Set`
              }`,
              `Ranged DPS Role: ${
                updateData.dpsRangedRoleId
                  ? `${rangedRole ? newMark : checkMark} <@&${
                      updateData.dpsRangedRoleId
                    }>`
                  : `${crossMark} Not Set`
              }`,
              `Battlemount Role: ${
                updateData.battlemountRoleId
                  ? `${mountRole ? newMark : checkMark} <@&${
                      updateData.battlemountRoleId
                    }>`
                  : `${crossMark} Not Set`
              }`,
            ].join("\n"),
          },
          {
            name: "Optional Settings",
            value: [
              `Language: ${
                updateData.language
                  ? `${language ? newMark : checkMark} ${
                      updateData.language === "pt"
                        ? "Português"
                        : updateData.language === "es"
                        ? "Español"
                        : "English"
                    }`
                  : `${checkMark} Default (English)`
              }`,
              `Command Prefix: ${
                updateData.commandPrefix
                  ? `${prefix ? newMark : checkMark} ${
                      updateData.commandPrefix
                    }`
                  : `${checkMark} Default (!albiongw)`
              }`,
              `Battle Log Channel: ${
                updateData.battlelogChannelId
                  ? `${battlelogChannel ? newMark : checkMark} <#${
                      updateData.battlelogChannelId
                    }>`
                  : `${crossMark} Not Set`
              }`,
              `Battle Log Webhook: ${
                updateData.battlelogWebhook
                  ? `${webhookUrl ? newMark : checkMark} Set`
                  : `${crossMark} Not Set`
              }`,
              `Min Total Players: ${
                updateData.minTotalPlayers
                  ? `${minTotalPlayers ? newMark : checkMark} ${
                      updateData.minTotalPlayers
                    }`
                  : `${checkMark} Default (20)`
              }`,
              `Min Guild Players: ${
                updateData.minGuildPlayers
                  ? `${minGuildPlayers ? newMark : checkMark} ${
                      updateData.minGuildPlayers
                    }`
                  : `${checkMark} Default (14)`
              }`,
              `Competitor Guilds: ${
                settings?.competitorIds?.length
                  ? `${checkMark} ${settings.competitorIds.length} set`
                  : `${crossMark} None set`
              } (Use /competitors to manage)`,
            ].join("\n"),
          },
        ])
        .setColor(Colors.Blue)
        .setTimestamp()
        .setFooter({
          text: `Updated by ${isSlash ? message.user.tag : message.author.tag}`,
        });

      // Send response
      if (isSlash) {
        await message.reply({ embeds: [setupEmbed], ephemeral: true });
      } else {
        await message.reply({ embeds: [setupEmbed] });
      }
    } catch (error) {
      console.error("Error in setup command:", error);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("An error occurred while configuring the guild.")
        .setColor(Colors.Red);

      if (isSlash) {
        await message.reply({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await message.reply({ embeds: [errorEmbed] });
      }
    }
  },
});
