const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { isAdmin } = require('../../utils/validators');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'setguildid',
    description: 'Set the Albion guild ID',
    category: 'admin',
    usage: '<guild_id>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 10,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'setguildid';
            const guildId = isSlash ? 
                message.options.getString('id') : 
                args[0];

            if (!guildId) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Missing Information')
                    .setDescription('Please provide the Albion guild ID.')
                    .addFields([
                        {
                            name: 'Usage',
                            value: isSlash ? 
                                '`/setguildid id:<guild_id>`' : 
                                '`!albiongw setguildid <guild_id>`'
                        }
                    ])
                    .setColor(Colors.Yellow)
                    .setTimestamp();

                await message.reply({
                    embeds: [errorEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            await prisma.guildSettings.upsert({
                where: {
                    guildId: message.guildId
                },
                update: {
                    albionGuildId: guildId,
                    guildName: message.guild.name
                },
                create: {
                    guildId: message.guildId,
                    albionGuildId: guildId,
                    guildName: message.guild.name
                }
            });

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Guild ID Updated')
                .setDescription('The Albion guild ID has been successfully updated. Note that this will only work if the guild ID is correct.')
                .addFields([
                    {
                        name: 'Guild ID',
                        value: `\`${guildId}\``,
                        inline: true
                    },
                    {
                        name: 'Discord Server',
                        value: `\`${message.guild.name}\``,
                        inline: true
                    }
                ])
                .setColor(Colors.Green)
                .setTimestamp()
                .setFooter({
                    text: `Updated by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await message.reply({
                embeds: [successEmbed],
                ephemeral: isSlash
            });

        } catch (error) {
            console.error('Error setting guild ID:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Update Failed')
                .setDescription('An error occurred while trying to update the Albion guild ID.')
                .setColor(Colors.Red)
                .setTimestamp()
                .setFooter({
                    text: `Attempted by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await message.reply({
                embeds: [errorEmbed],
                ephemeral: isSlash
            });
        }
    }
}); 