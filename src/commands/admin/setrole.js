const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'setrole',
    description: 'Set a role for a specific Albion Online class',
    category: 'admin',
    usage: '<type> @role',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'setrole';
            
            // Get role and type based on command type
            let roleType, role;
            if (isSlash) {
                roleType = message.options.getString('type')?.toLowerCase();
                role = message.options.getRole('role');
            } else {
                roleType = args[0]?.toLowerCase();
                role = message.mentions.roles.first();
            }

            const roleMap = {
                'tank': 'tankRoleId',
                'support': 'supportRoleId',
                'healer': 'healerRoleId',
                'melee': 'dpsMeleeRoleId',
                'ranged': 'dpsRangedRoleId',
                'mount': 'battlemountRoleId'
            };

            if (!roleType || !roleMap[roleType]) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Invalid Role Type')
                    .setDescription('Please provide a valid role type.')
                    .addFields([
                        {
                            name: 'Usage',
                            value: isSlash ? 
                                '`/setrole type:<type> role:@role`' : 
                                '`!albiongw setrole <type> @role`'
                        },
                        {
                            name: 'Available Types',
                            value: '`tank`, `support`, `healer`, `melee`, `ranged`, `mount`'
                        },
                        {
                            name: 'Example',
                            value: isSlash ? 
                                '`/setrole type:tank role:@Tank`' : 
                                '`!albiongw setrole tank @Tank`'
                        }
                    ])
                    .setColor(Colors.Red)
                    .setTimestamp();

                await message.reply({
                    embeds: [errorEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            if (!role) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Invalid Role')
                    .setDescription('Please mention a valid Discord role.')
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
                    [roleMap[roleType]]: role.id,
                    guildName: message.guild.name
                },
                create: {
                    guildId: message.guildId,
                    [roleMap[roleType]]: role.id,
                    guildName: message.guild.name
                }
            });

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Role Assignment Updated')
                .setDescription('The role assignment has been successfully updated.')
                .addFields([
                    {
                        name: 'Role Type',
                        value: `\`${roleType}\``,
                        inline: true
                    },
                    {
                        name: 'Discord Role',
                        value: `<@&${role.id}>`,
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
            console.error('Error setting role:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Update Failed')
                .setDescription('An error occurred while trying to update the role assignment.')
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