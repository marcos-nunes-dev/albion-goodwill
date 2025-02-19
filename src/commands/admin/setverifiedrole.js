const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'setverifiedrole',
    description: 'Set the role for verified Albion Online players',
    category: 'admin',
    usage: '@role',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'setverifiedrole';
            const role = isSlash ? 
                message.options.getRole('role') : 
                message.mentions.roles.first();

            if (!role) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Missing Information')
                    .setDescription('Please mention the Discord role to be used for verified players.')
                    .addFields([
                        {
                            name: 'Usage',
                            value: isSlash ? 
                                '`/setverifiedrole role:@role`' : 
                                '`!albiongw setverifiedrole @role`'
                        },
                        {
                            name: 'Example',
                            value: isSlash ? 
                                '`/setverifiedrole role:@Verified`' : 
                                '`!albiongw setverifiedrole @Verified`'
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
                    nicknameVerifiedId: role.id,
                    guildName: message.guild.name
                },
                create: {
                    guildId: message.guildId,
                    nicknameVerifiedId: role.id,
                    guildName: message.guild.name
                }
            });

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Verified Role Updated')
                .setDescription('The verified role has been successfully updated.')
                .addFields([
                    {
                        name: 'New Verified Role',
                        value: `<@&${role.id}>`,
                        inline: true
                    },
                    {
                        name: 'Role Name',
                        value: `\`${role.name}\``,
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
            console.error('Error setting verified role:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Update Failed')
                .setDescription('An error occurred while trying to update the verified role.')
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