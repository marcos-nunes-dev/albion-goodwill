const Command = require('../../structures/Command');
const { PermissionFlagsBits, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require('discord.js');
const prisma = require('../../config/prisma');

// Number emojis for parties (1-10)
const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = new Command({
    name: 'x',
    description: 'Select a weapon to ping from the composition',
    category: 'albion',
    options: [
        {
            name: 'user',
            description: 'The user to ping (Admin only)',
            type: 6, // USER type
            required: false
        }
    ],
    async execute(interaction) {
        try {
            // Debug: Log user and guild information
            console.log('Registration Check - Input Parameters:', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                username: interaction.user.tag
            });

            // Check if user is registered
            const registration = await prisma.playerRegistration.findFirst({
                where: {
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                }
            });

            // Debug: Log registration result
            console.log('Registration Check - Query Result:', {
                found: !!registration,
                registration: registration ? {
                    id: registration.id,
                    userId: registration.userId,
                    guildId: registration.guildId,
                    createdAt: registration.createdAt
                } : null
            });

            if (!registration) {
                console.log('Registration Check - Failed: User not registered');
                return interaction.reply({
                    content: 'You need to register with /register first.',
                    ephemeral: true
                });
            }

            // Check if command is used in a thread
            if (!interaction.channel.isThread()) {
                return interaction.reply({
                    content: 'This command can only be used in a composition thread.',
                    ephemeral: true
                });
            }

            // Get the composition for this thread
            const composition = await prisma.composition.findFirst({
                where: {
                    threadId: interaction.channel.id,
                    status: 'open'
                }
            });

            if (!composition) {
                return interaction.reply({
                    content: 'Could not find an open composition in this thread.',
                    ephemeral: true
                });
            }

            // Get the role and check if user has it
            const role = await interaction.guild.roles.fetch(composition.roleId);
            const member = await interaction.guild.members.fetch(interaction.user.id);

            // Allow admins to bypass role check
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            // Check if user has the required role or is an admin
            if (!isAdmin && !member.roles.cache.has(role.id)) {
                return interaction.reply({
                    content: `You need the ${role.name} role to use this command.`,
                    ephemeral: true
                });
            }

            // Get target user (if specified)
            const targetUser = interaction.options.getUser('user');
            
            // If target user is specified, check if the command user has admin permissions
            if (targetUser) {
                const hasPermission = member.permissions.has(PermissionFlagsBits.Administrator);
                
                if (!hasPermission) {
                    return interaction.reply({
                        content: 'Only administrators can ping weapons for other users.',
                        ephemeral: true
                    });
                }

                // Check if target user is registered
                const targetRegistration = await prisma.playerRegistration.findFirst({
                    where: {
                        userId: targetUser.id,
                        guildId: interaction.guildId
                    }
                });

                if (!targetRegistration) {
                    return interaction.reply({
                        content: `${targetUser.tag} is not registered. They need to register with /register first.`,
                        ephemeral: true
                    });
                }
            }

            // Create options for each weapon in each party
            const options = [];
            composition.data.parties.forEach((party, partyIndex) => {
                // Add specific weapons
                party.weapons.forEach((weapon, weaponIndex) => {
                    if (weapon.players_required > 0) {
                        // Clean up weapon name
                        const cleanWeaponName = weapon.type.replace("Elder's ", "");
                        const roleStatus = weapon.free_role ? '(Free)' : '';
                        
                        options.push(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(`${cleanWeaponName} ${roleStatus}`)
                                .setDescription(`${party.name} - ${weapon.players_required}x required`)
                                .setValue(`${partyIndex}-${weaponIndex}`)
                                .setEmoji(NUMBER_EMOJIS[partyIndex] || '⚔️')
                        );
                    }
                });
            });

            // Add single Fill option at the end
            options.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Fill')
                    .setDescription('Fill any role - Can play any weapon')
                    .setValue('fill')
                    .setEmoji('⬜')
            );

            if (options.length === 0) {
                return interaction.reply({
                    content: 'No available weapons found in the composition.',
                    ephemeral: true
                });
            }

            // Create select menu
            const select = new StringSelectMenuBuilder()
                .setCustomId('select_weapon')
                .setPlaceholder('Select a weapon to ping')
                .addOptions(options);

            const row = new ActionRowBuilder()
                .addComponents(select);

            // Store composition data and target user in a temporary cache
            interaction.client.compositions = interaction.client.compositions || new Map();
            interaction.client.compositions.set(interaction.user.id, {
                compositionId: composition.id,
                data: composition.data,
                targetUserId: targetUser?.id, // Store target user ID if specified
                expires: Date.now() + 300000 // 5 minutes
            });

            const replyContent = targetUser 
                ? `Select a weapon to ping for ${targetUser}:`
                : 'Select a weapon to ping:';

            await interaction.reply({
                content: replyContent,
                components: [row],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in x command:', error);
            return interaction.reply({
                content: 'An error occurred while processing the command.',
                ephemeral: true
            });
        }
    }
});
