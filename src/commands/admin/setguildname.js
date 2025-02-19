const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'setguildname',
    description: 'Set the Albion guild name for this server',
    category: 'admin',
    usage: '<guild_name>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'setguildname';
            const guildName = isSlash ? 
                message.options.getString('name') : 
                args.join(' ');

            if (!guildName) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Missing Information')
                    .setDescription('Please provide the Albion guild name.')
                    .addFields([
                        {
                            name: 'Usage',
                            value: isSlash ? 
                                '`/setguildname name:<guild_name>`' : 
                                '`!albiongw setguildname <guild_name>`'
                        },
                        {
                            name: 'Example',
                            value: isSlash ? 
                                '`/setguildname name:MyGuild`' : 
                                '`!albiongw setguildname MyGuild`'
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
                    guildName: guildName 
                },
                create: {
                    guildId: message.guildId,
                    guildName: guildName
                }
            });

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Guild Name Updated')
                .setDescription('The Albion guild name has been successfully updated.')
                .addFields([
                    {
                        name: 'New Guild Name',
                        value: `\`${guildName}\``,
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
            console.error('Error setting guild name:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Update Failed')
                .setDescription('An error occurred while trying to update the guild name.')
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