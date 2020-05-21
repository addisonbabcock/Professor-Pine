"use strict";

const log = require('loglevel').getLogger('MeetTimeCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus, TimeParameter} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  moment = require('moment'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class MeetTimeCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'meet',
      group: CommandGroup.BASIC_RAID,
      memberName: 'meet',
      aliases: ['start', 'start-time', 'starts'],
      description: 'Sets the planned meeting time for an existing party.',
      details: 'Use this command to set when a party intends to meet.  If possible, try to set times 20 minutes out and always try to arrive at least 5 minutes before the meeting time being set.',
      examples: ['\t!meet 2:20pm'],
      args: [
        {
          key: TimeParameter.MEET,
          label: 'meeting time',
          prompt: 'When do you wish to meet for this party?\nExamples: `8:43`, `2:20pm`\n\n*or*\n\nIn how long (in minutes) do you wish to meet for this party?\nExample: `15`\n',
          type: 'time'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'meet' &&
        !PartyManager.validParty(message.channel.id)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Set the meeting time for a raid from its raid channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const startTime = args[TimeParameter.MEET],
      raid = PartyManager.getParty(message.channel.id),
      info = startTime === -1 ?
        await raid.cancelMeetingTime(message.member.id) :
        await raid.setMeetingTime(message.member.id, startTime);

    if (info.error) {
      message.reply(info.error)
        .catch(err => log.error(err));
      return;
    }

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    const groupId = raid.attendees[message.member.id].group,
      totalAttendees = raid.getAttendeeCount(groupId),
      verb = totalAttendees === 1 ?
        'is' :
        'are',
      noun = totalAttendees === 1 ?
        'trainer' :
        'trainers',
      calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },
      formattedStartTime = moment(startTime).calendar(null, calendarFormat),
      channel = (await PartyManager.getChannel(raid.channelId)).channel,
      messagesToSend = [];

    // notify all attendees in same group that a time has been set
    for (const [attendee, attendeeStatus] of Object.entries(raid.attendees)
      .filter(([attendee, attendeeStatus]) => attendee !== message.member.id &&
        attendeeStatus.status !== PartyStatus.COMPLETE)
      .filter(([attendee, attendeeStatus]) => attendeeStatus.group === groupId)) {
      const messageToSend = startTime === -1 ?
        `${message.member.displayName} has canceled the meeting time for ${channel.toString()}. ` +
        `There ${verb} currently **${totalAttendees}** ${noun} attending!` :
        `${message.member.displayName} set a meeting time of ${formattedStartTime} for ${channel.toString()}. ` +
        `There ${verb} currently **${totalAttendees}** ${noun} attending!`;

      messagesToSend.push({
        userId: attendee,
        message: messageToSend
      });
    }

    Helper.sendNotificationMessages(messagesToSend)
      .catch(err => log.error(err));

    raid.refreshStatusMessages()
      .catch(err => log.error(err));
  }
}

module.exports = MeetTimeCommand;
