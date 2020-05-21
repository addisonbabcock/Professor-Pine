const log = require('loglevel').getLogger('SetRegionCommand'),
  commando = require('discord.js-commando'),
  oneLine = require('common-tags').oneLine,
  GymCache = require('../../../app/gym'),
  Helper = require('../../../app/helper'),
  PartyManager = require('../../../app/party-manager'),
  Region = require('../../../app/region'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class SetRegion extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'setbounds',
      aliases: ['set-bounds', 'set-region', 'bound'],
      group: CommandGroup.REGION,
      memberName: 'setbounds',
      description: 'Sets the region area/bounds.',
      details: oneLine`
				This command accepts a kml file of a polygon on a map that defines a region.
				This command is the envy of all other commands.
			`,
      examples: ['!setbounds']
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'setbounds') {
        if (PartyManager.validParty(message.channel.id)) {
          return {
            reason: 'invalid-channel',
            response: message.reply('You may not define a region for a raid channel.')
          };
        }
        if (!Helper.isBotManagement(message)) {
          return {
            reason: 'unauthorized',
            response: message.reply('You are not authorized to use this command.')
          };
        }

        if (Helper.isChannelChild(message.channel.id) && PartyManager.categoryHasRegion(Helper.getParentChannel(message.channel.id).id) && !PartyManager.channelCanRaid(message.channel.id)) {
          const channel = Helper.regionChannelForCategory(Helper.getParentChannel(message.channel.id).id, PartyManager.getRaidChannelCache());
          return {
            reason: 'invalid-channel',
            response: message.reply("This category already has a region channel. You may only have one region channel per category. Please see " + channel.toString() + " for region info.")
          };
        }
      }

      return false;
    });
  }

  async run(msg) {
    // get kml attachment url
    if (msg.attachments.first() !== undefined) {
      log.debug(msg.attachments.first().url);
      const file = msg.attachments.first().url;
      const data = await Region.parseRegionData(file)
        .catch(error => false);
      if (data) {
        const polydata = data["features"][0]["geometry"]["coordinates"][0];
        if (await Region.storeRegion(polydata, msg.channel.id, msg.channel.guild.id, GymCache)
          .catch(error => false)) {
          PartyManager.cacheRegionChannel(msg.channel.id);
          Region.getRegionDetailEmbed(msg.channel.id)
            .then(embed => {
              if (embed) {
                msg.channel.send({embed})
                  .catch(err => log.error(err));
              }
            })
            .catch(error => msg.say("An error occurred retrieving the region.")
              .catch(err => log.error(err)));
          Helper.client.emit('regionsUpdated');
        } else {
          msg.say("An error occurred storing the region.")
            .catch(err => log.error(err));
        }
      } else {
        msg.say("An error occurred parsing your KML data.")
          .catch(err => log.error(err));
      }
    } else {
      msg.delete()
        .catch(err => log.error(err));
      msg.reply("Please add the `setbounds` command as a comment when uploading a KML file.")
        .catch(err => log.error(err));
    }
  }
};
