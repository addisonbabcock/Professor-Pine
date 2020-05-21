"use strict";

const log = require('loglevel').getLogger('InterestedCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  moment = require('moment'),
  NaturalArgumentType = require('../../types/natural'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Utility = require('../../app/utility');

class InterestedCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'maybe',
      group: CommandGroup.BASIC_RAID,
      memberName: 'maybe',
      aliases: ['interested', 'interest', 'hmm', 'hm', 'hmmm', 'hmmmm', 'hmmmmm'],
      description: 'Expresses interest in an existing raid without committing to it.',
      details: 'Use this command to express interest in a raid.',
      examples: ['\t!maybe', '\t!interested', '\t!hmm'],
      args: [
        {
          key: 'additionalAttendees',
          label: 'additional attendees',
          prompt: 'How many additional people would come with you?\nExample: `+1`\n\n*or*\n\nHow many people would come (including yourself)?\nExample: `2`\n',
          type: 'natural|raid-group',
          default: NaturalArgumentType.UNDEFINED_NUMBER
        }
      ],
      commandErrorMessage: (message, provided) =>
        `\`${provided[0]}\` is not a valid number of attendees!  If you intend to join a group, use the \`${client.commandPrefix}group\` command!`,
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'maybe' &&
        !PartyManager.validParty(message.channel.id)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Express interest in a raid from its raid channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const {additionalAttendees, isReaction, reactionMemberId} = args,
      memberId = reactionMemberId || message.member.id,
      groupId = typeof additionalAttendees === 'string' && additionalAttendees !== NaturalArgumentType.UNDEFINED_NUMBER ? additionalAttendees : false,
      raid = PartyManager.getParty(message.channel.id),
      currentStatus = raid.getMemberStatus(memberId),
      groupCount = raid.groups.length;

    let statusPromise;

    if (currentStatus === PartyStatus.NOT_INTERESTED && groupCount > 1 && groupId === false) {
      const calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      };

      let prompt = 'Which group do you wish to show interest in for this raid?\n\n';

      raid.groups.forEach(group => {
        const startTime = !!group.startTime ?
          moment(group.startTime) :
          '',
          totalAttendees = raid.getAttendeeCount(group.id);

        let groupLabel = `**${group.id}**`;

        if (!!group.label) {
          const truncatedLabel = group.label.length > 150 ?
            group.label.substring(0, 149).concat('…') :
            group.label;

          groupLabel += ` (${truncatedLabel})`;
        }

        if (!!startTime) {
          groupLabel += ` :: ${startTime.calendar(null, calendarFormat)}`;
        }

        prompt += groupLabel + ` :: ${totalAttendees} possible trainers\n`;
      });

      const groupCollector = new Commando.ArgumentCollector(this.client, [
        {
          key: 'group',
          label: 'group',
          prompt: prompt,
          type: 'raid-group'
        }
      ], 3);

      let groupId = raid.defaultGroupId;

      statusPromise = groupCollector.obtain(message)
        .then(async collectionResult => {
          Utility.cleanCollector(collectionResult);

          if (!collectionResult.cancelled) {
            groupId = collectionResult.values['group'];
          }

          await raid.setMemberGroup(memberId, groupId);
          return await raid.setMemberStatus(memberId, PartyStatus.INTERESTED, additionalAttendees);
        });
    } else if (groupId && currentStatus === PartyStatus.NOT_INTERESTED) {
      statusPromise = Promise.all([
        await raid.setMemberGroup(memberId, groupId),
        await raid.setMemberStatus(memberId, PartyStatus.INTERESTED)]);
    } else if (groupId && currentStatus !== PartyStatus.NOT_INTERESTED) {
      const attendee = await raid.getAttendee(memberId),
        additional = attendee.number - 1;
      statusPromise = Promise.all([
        await raid.setMemberGroup(memberId, groupId),
        await raid.setMemberStatus(memberId, PartyStatus.INTERESTED, additional)]);
    } else {
      statusPromise = Promise.resolve(
        await raid.setMemberStatus(memberId, PartyStatus.INTERESTED, groupId ? 0 : additionalAttendees));
    }

    statusPromise.then(info => {
      if (!info.error) {
        if (!isReaction) {
          message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
            .catch(err => log.error(err));
        }

        raid.refreshStatusMessages()
          .catch(err => log.error(err));
      } else if (!isReaction) {
        message.reply(info.error)
          .catch(err => log.error(err));
      }
    });
  }
}

module.exports = InterestedCommand;
