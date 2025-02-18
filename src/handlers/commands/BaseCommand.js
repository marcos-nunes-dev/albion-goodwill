const ResponseFormatter = require('../../utils/ResponseFormatter');
const { DEFAULT_COOLDOWN } = require('../../config/constants');
const { commandMetadata } = require('../../config/commandMetadata');

class BaseCommand {
    constructor() {
        this.cooldowns = new Map();
    }

    getMetadata(commandName) {
        return commandMetadata[commandName];
    }

    async checkPermissions(source, commandName) {
        const metadata = this.getMetadata(commandName);
        if (!metadata?.permissions) return true;

        if (!source.member.permissions.has(metadata.permissions)) {
            await this.reply(
                source, 
                ResponseFormatter.error(`Você precisa ter permissões de ${metadata.permissions} para usar este comando.`),
                true
            );
            return false;
        }
        return true;
    }

    async checkCooldown(source, commandName) {
        const metadata = this.getMetadata(commandName);
        const cooldownAmount = metadata?.cooldown || 3000;
        const userId = source.member.id;
        const now = Date.now();

        const key = `${commandName}-${userId}`;
        if (this.cooldowns.has(key)) {
            const expirationTime = this.cooldowns.get(key) + cooldownAmount;

            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                await this.reply(
                    source,
                    ResponseFormatter.warning(`Por favor, aguarde ${timeLeft.toFixed(1)} segundos antes de usar este comando novamente.`),
                    true
                );
                return false;
            }
        }

        this.cooldowns.set(key, now);
        setTimeout(() => this.cooldowns.delete(key), cooldownAmount);
        return true;
    }

    async showUsage(source, commandName) {
        const metadata = this.getMetadata(commandName);
        if (!metadata) return;

        const response = [
            `**${commandName}** - ${metadata.description}`,
            '',
            `**Uso:** ${metadata.usage}`,
            metadata.options ? '\n**Opções:**\n' + Object.entries(metadata.options)
                .map(([name, values]) => `${name}: ${Array.isArray(values) ? values.join(', ') : values.map(v => v.name).join(', ')}`)
                .join('\n') : '',
            '',
            '**Exemplos:**',
            metadata.examples.map(ex => `\`${ex}\``).join('\n')
        ].filter(Boolean).join('\n');

        await this.reply(source, response, true);
    }

    async reply(source, content, ephemeral = false) {
        try {
            if (source.commandName) {
                // Slash command
                if (source.replied) {
                    await source.editReply({ content });
                } else {
                    await source.reply({ content, ephemeral });
                }
            } else {
                // Text command
                if (content.length > 2000) {
                    const chunks = this.splitMessage(content);
                    for (const chunk of chunks) {
                        await source.channel.send(chunk);
                    }
                } else {
                    await source.reply(content);
                }
            }
        } catch (error) {
            console.error('Error sending reply:', error);
        }
    }

    splitMessage(content, maxLength = 2000) {
        const chunks = [];
        let currentChunk = '';

        content.split('\n').forEach(line => {
            if (currentChunk.length + line.length + 1 > maxLength) {
                chunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk += (currentChunk ? '\n' : '') + line;
            }
        });

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    handleError(error, source, customMessage = null) {
        console.error(`Error in ${this.constructor.name}:`, error);
        const response = customMessage || 'Ocorreu um erro ao executar este comando.';
        return this.reply(source, ResponseFormatter.error(response), true);
    }

    validateArgs(args, validations) {
        const errors = [];
        for (const [arg, validation] of Object.entries(validations)) {
            if (validation.required && !args[arg]) {
                errors.push(validation.message || `${arg} é obrigatório.`);
                continue;
            }
            if (args[arg] && validation.validate && !validation.validate(args[arg])) {
                errors.push(validation.error || `${arg} é inválido.`);
            }
        }
        return errors;
    }

    validateSlashCommand(interaction, options) {
        const errors = [];
        for (const [name, validation] of Object.entries(options)) {
            const value = interaction.options.get(name)?.value;
            if (validation.required && !value) {
                errors.push(validation.message || `${name} é obrigatório.`);
                continue;
            }
            if (value && validation.validate && !validation.validate(value)) {
                errors.push(validation.error || `${name} é inválido.`);
            }
        }
        return errors;
    }

    resolveAlias(command) {
        const { COMMAND_ALIASES } = require('../../config/constants');
        return COMMAND_ALIASES[command] || command;
    }
}

module.exports = BaseCommand; 