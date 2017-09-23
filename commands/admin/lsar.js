"use strict";

const log = require('loglevel').getLogger('JoinCommand'),
	Commando = require('discord.js-commando'),
	Helper = require('../../app/helper'),
	Role = require('../../app/role');

class LsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'lsar',
			group: 'admin',
			memberName: 'lsar',
			aliases: ['roles'],
			description: 'List self assignable roles.',
			argsType: 'multiple',
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'lsar') {
				if (!Helper.isManagement(message)) {
					return ['unauthorized', message.reply('You are not authorized to use this command.')];
				}

				return ['invalid-channel', message.reply('Please use `!lsar` from a public channel.')];
			}

			return false;
		});
	}

	run(message, args) {
		Role.getRoles(message.channel, message.member).then((roles) => {
			const count = roles.length;

			let string = '';
			for (let i=0; i<roles.length; i++) {
				string += roles[i].value + '\n';
			}

			message.channel.send({
				'embed': {
					'title': `There are ${count} self assignable roles`,
					'description':
						`${string}`,
					'color': 4437377
				}
			});
		}).catch((err) => {
			if (err && err.error) {
				message.reply(err.error);
			} else {
				console.log(err);
			}
		});
	}
}

module.exports = LsarCommand;