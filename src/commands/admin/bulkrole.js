const Command = require("../../structures/Command");
const { EmbedBuilder, Colors } = require("discord.js");

module.exports = new Command({
  name: "bulkrole",
  description: "Add or remove a role from multiple users or roles",
  category: "admin",
  permissions: ["ADMINISTRATOR"],
  cooldown: 5,
  async execute(message, args, handler) {
    try {
      const isSlash = message.commandName === "bulkrole";

      // Defer the reply for slash commands
      if (isSlash) {
        await message.deferReply();
      }

      // Get parameters based on command type
      const action = isSlash
        ? message.options.getString("action")
        : args[0]?.toLowerCase();

      const targetRole = isSlash
        ? message.options.getRole("target_role")
        : message.mentions.roles.first();

      // For slash commands, get both parameters
      const usersAndRoles = isSlash
        ? message.options.getString("users_and_roles")
        : null;

      const channel = isSlash ? message.options.getChannel("channels") : null;

      // For traditional commands, parse mentions from the message
      const targets = !isSlash
        ? message.content.split(" ").slice(3).join(" ")
        : null;

      // Validate action
      if (!action || !["add", "remove"].includes(action)) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("⚠️ Invalid Action")
          .setDescription("Please specify a valid action (add/remove).")
          .setColor(Colors.Yellow)
          .setTimestamp();

        if (isSlash) {
          await message.editReply({ embeds: [errorEmbed] });
        } else {
          await message.reply({ embeds: [errorEmbed] });
        }
        return;
      }

      // Validate target role
      if (!targetRole) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("⚠️ Missing Target Role")
          .setDescription("Please specify the role to add or remove.")
          .setColor(Colors.Yellow)
          .setTimestamp();

        if (isSlash) {
          await message.editReply({ embeds: [errorEmbed] });
        } else {
          await message.reply({ embeds: [errorEmbed] });
        }
        return;
      }

      // Get all members to process
      const membersToProcess = new Set();

      if (isSlash) {
        // Handle users and roles from slash command
        if (usersAndRoles) {
          const roleMentions = usersAndRoles.match(/<@&(\d+)>/g) || [];
          const userMentions = usersAndRoles.match(/<@!?(\d+)>/g) || [];

          // Add members from mentioned roles
          for (const mention of roleMentions) {
            const roleId = mention.match(/<@&(\d+)>/)[1];
            const role = message.guild.roles.cache.get(roleId);
            if (role) {
              role.members.forEach((member) => membersToProcess.add(member));
            }
          }

          // Add mentioned users
          for (const mention of userMentions) {
            const userId = mention.match(/<@!?(\d+)>/)[1];
            const member = message.guild.members.cache.get(userId);
            if (member) {
              membersToProcess.add(member);
            }
          }
        }

        // Handle channel from slash command
        if (channel) {
          channel.members.forEach((member) => membersToProcess.add(member));
        }
      } else {
        // Handle traditional command with mentions
        const roleMentions = targets.match(/<@&(\d+)>/g) || [];
        const userMentions = targets.match(/<@!?(\d+)>/g) || [];
        const channelMentions = targets.match(/<#(\d+)>/g) || [];

        // Add members from mentioned roles
        for (const mention of roleMentions) {
          const roleId = mention.match(/<@&(\d+)>/)[1];
          const role = message.guild.roles.cache.get(roleId);
          if (role) {
            role.members.forEach((member) => membersToProcess.add(member));
          }
        }

        // Add mentioned users
        for (const mention of userMentions) {
          const userId = mention.match(/<@!?(\d+)>/)[1];
          const member = message.guild.members.cache.get(userId);
          if (member) {
            membersToProcess.add(member);
          }
        }

        // Add members from mentioned voice channels
        for (const mention of channelMentions) {
          const channelId = mention.match(/<#(\d+)>/)[1];
          const channel = message.guild.channels.cache.get(channelId);
          if (channel && channel.type === "GUILD_VOICE") {
            channel.members.forEach((member) => membersToProcess.add(member));
          }
        }
      }

      if (membersToProcess.size === 0) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("⚠️ No Valid Targets")
          .setDescription("No valid users, roles, or channels were found.")
          .setColor(Colors.Yellow)
          .setTimestamp();

        if (isSlash) {
          await message.editReply({ embeds: [errorEmbed] });
        } else {
          await message.reply({ embeds: [errorEmbed] });
        }
        return;
      }

      // Process members
      let successCount = 0;
      let failCount = 0;
      const processedMembers = new Set();

      for (const member of membersToProcess) {
        if (processedMembers.has(member.id)) continue;
        processedMembers.add(member.id);

        try {
          if (action === "add") {
            await member.roles.add(targetRole);
          } else {
            await member.roles.remove(targetRole);
          }
          successCount++;
        } catch (error) {
          console.error(`Error processing member ${member.user.tag}:`, error);
          failCount++;
        }
      }

      // Create result embed
      const resultEmbed = new EmbedBuilder()
        .setTitle(
          `✅ Bulk Role ${action === "add" ? "Addition" : "Removal"} Complete`
        )
        .setDescription(`Processed ${processedMembers.size} members`)
        .addFields([
          {
            name: "Target Role",
            value: targetRole.toString(),
            inline: true,
          },
          {
            name: "Successful",
            value: successCount.toString(),
            inline: true,
          },
          {
            name: "Failed",
            value: failCount.toString(),
            inline: true,
          },
        ])
        .setColor(Colors.Green)
        .setTimestamp();

      if (isSlash) {
        await message.editReply({ embeds: [resultEmbed] });
      } else {
        await message.reply({ embeds: [resultEmbed] });
      }
    } catch (error) {
      console.error("Error in bulkrole command:", error);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("An error occurred while processing the command.")
        .setColor(Colors.Red)
        .setTimestamp();

      if (isSlash) {
        if (message.replied) {
          await message.editReply({ embeds: [errorEmbed] });
        } else {
          await message.reply({ embeds: [errorEmbed] });
        }
      } else {
        await message.reply({ embeds: [errorEmbed] });
      }
    }
  },
});
