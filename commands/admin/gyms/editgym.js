"use strict";

const log = require('loglevel').getLogger('EditGymCommand'),
  commando = require('discord.js-commando'),
  oneLine = require('common-tags').oneLine,
  Helper = require('../../../app/helper'),
  Gym = require('../../../app/gym'),
  ImageCacher = require('../../../app/imagecacher'),
  PartyManager = require('../../../app/party-manager'),
  Region = require('../../../app/region'),
  Utility = require('../../../app/utility'),
  {CommandGroup} = require('../../../app/constants');

function getGymMetaFields() {
  return ['location', 'name', 'nickname', 'description', 'keywords', 'exraid', 'notice']
}

module.exports = class EditGym extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'edit-gym',
      group: CommandGroup.REGION,
      memberName: 'edit-gym',
      description: 'Edit a gyms meta data',
      details: oneLine`
				This command will allow the user to edit one of the gyms meta data fields.
        		Fields include name, nickname, location, ex raid eligibility, notice, description or keywords.
			`,
      examples: ['\teditgym dog stop'],
      argsPromptLimit: 3
    });

    this.gymCollector = new commando.ArgumentCollector(client, [{
      key: 'gym',
      prompt: 'What gym are you trying to edit? Provide a name or a search term',
      type: 'findgym'
    }], 3);

    this.fieldCollector = new commando.ArgumentCollector(client, [{
      key: 'field',
      prompt: 'What field of the gym do you wish to edit? Available fields: `location`,`name`,`nickname`,`description`,`keywords`,`exraid`,`notice`.',
      type: 'string',
      oneOf: ['location', 'name', 'nickname', 'description', 'keywords', 'exraid', 'notice']
    }], 3);

    this.nameCollector = new commando.ArgumentCollector(client, [{
      key: 'name',
      prompt: 'Provide a new name for this gym.',
      type: 'string',
      validate: value => {
        if (value.replaceAll(" ", "").length > 0) {
          return true;
        } else {
          return "You must provide a valid name for this gym."
        }
      }
    }], 3);

    this.nicknameCollector = new commando.ArgumentCollector(client, [{
      key: 'nickname',
      prompt: 'Provide a new nickname for this gym. To remove this field from this gym, type `remove`.',
      type: 'string'
    }], 3);

    this.descriptionCollector = new commando.ArgumentCollector(client, [{
      key: 'description',
      prompt: 'Provide a new description for this gym. To remove this field from this gym, type `remove`.',
      type: 'string',
      wait: 60
    }], 3);

    this.locationCollector = new commando.ArgumentCollector(client, [{
      key: 'location',
      prompt: 'What is the latitude & longitude location of this gym? Can provide a pin link from apple maps or comma separated numbers.',
      type: 'coords',
      wait: 60
    }], 3);

    this.keywordsCollector = new commando.ArgumentCollector(client, [{
      key: 'keywords',
      prompt: 'Type `add` or `remove` followed by a list of keywords separated by commas. To remove all existing keywords type `remove all`.',
      type: 'keywords'
    }], 3);

    this.noticeCollector = new commando.ArgumentCollector(client, [{
      key: 'notice',
      prompt: 'Provide a notice for this gym (ie: Warnings, Parking Restrictions, Safety suggestions etc). To remove an existing notice type `remove`.',
      type: 'string'
    }], 3);

    this.exTagCollector = new commando.ArgumentCollector(client, [{
      key: 'extag',
      prompt: 'Does this gym currently have an EX Raid tag on it? (Yes or No)',
      type: 'string',
      validate: value => {
        if (value.toLowerCase() === 'yes' || value.toLowerCase() === 'y' || value.toLowerCase() === 'no' || value.toLowerCase() === 'n') {
          return true;
        } else {
          return "Please provide a valid yes or no response.";
        }
      }
    }], 3);

    this.exPreviousCollector = new commando.ArgumentCollector(client, [{
      key: 'exprevious',
      prompt: 'Has the gym previously held an EX Raid? (Yes or No)',
      type: 'string',
      validate: value => {
        if (value.toLowerCase() === 'yes' || value.toLowerCase() === 'y' || value.toLowerCase() === 'no' || value.toLowerCase() === 'n') {
          return true;
        } else {
          return "Please provide a valid yes or no response.";
        }
      }
    }], 3);

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'edit-gym') {
        if (!Helper.isBotManagement(message)) {
          return {
            reason: 'unauthorized',
            response: message.reply('You are not authorized to use this command.')
          };
        }

        if (!Helper.isBotChannel(message) && !Helper.isChannelBounded(message.channel.id, PartyManager.getRaidChannelCache())) {
          return {
            reason: 'invalid-channel',
            response: message.reply('Edit gyms from regional channels or a bot channel.')
          };
        }
      }

      return false;
    });
  }

  getQuotedString(value) {
    const single = value.split(/'/);
    const double = value.split(/"/);

    if (single.length === 3) {
      return single[1];
    } else if (double.length === 3) {
      return double[1];
    } else {
      return null;
    }
  }

  getGymArgument(args) {
    if (this.getQuotedString(args)) {
      return this.getQuotedString(args);
    } else {
      if (this.getFieldArgument(args)) {
        const field = this.getFieldArgument(args);
        return args.substring(0, args.length - field.length)
      } else {
        return args;
      }
    }
  }

  getFieldArgument(args) {
    const pieces = args.split(" ");
    if (pieces.length <= 1) {
      return null;
    } else {
      const last = pieces[pieces.length - 1];
      if (getGymMetaFields().indexOf(last.toLowerCase()) !== -1) {
        return last;
      }
    }
  }

  cleanup(msg, results, gymMessage) {
    let messagesToDelete = [msg];

    if (gymMessage) {
      messagesToDelete = [...messagesToDelete, gymMessage];
    }

    if (results && results.length > 0) {
      results
        .forEach(result => messagesToDelete = [...messagesToDelete, ...result.prompts, ...result.answers]);
    }

    Utility.deleteMessages(messagesToDelete);
  }

  async run(msg, args) {
    log.info(args.constructor.name);
    const that = this;
    const gymArgs = (args.length > 0) ? [this.getGymArgument(args)] : [];
    this.gymCollector.obtain(msg, gymArgs)
      .then(async gymResult => {
        if (!gymResult.cancelled) {

          const gym = gymResult.values["gym"];
          const gymMessage = gym.message;

          const fieldArgs = that.getFieldArgument(args) ? [that.getFieldArgument(args)] : [];

          log.info("field: " + fieldArgs);

          that.fieldCollector.obtain(msg, fieldArgs)
            .then(async fieldResult => {
              if (!fieldResult.cancelled) {
                const value = fieldResult.values["field"].toLowerCase();

                if (value === 'location') {
                  that.locationCollector.obtain(msg)
                    .then(async collectionResult => {
                      if (!collectionResult.cancelled) {
                        const location = collectionResult.values["location"];
                        const result = await Region.setGymLocation(gym["id"], location, Gym)
                          .catch(error => msg.say("An error occurred changing the location of this gym.")
                            .catch(err => log.error(err)));
                        ImageCacher.deleteCachedImage(`images/gyms/${gym["id"]}.png`);
                        if (result["id"]) {
                          that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                          Region.showGymDetail(msg, result, "Updated Gym Location", msg.member.displayName, false)
                            .catch(err => log.error(err));
                        }
                      } else {
                        that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                      }
                    });
                } else if (value === 'name') {
                  that.nameCollector.obtain(msg)
                    .then(async collectionResult => {
                      if (!collectionResult.cancelled) {
                        const name = collectionResult.values["name"];
                        const result = await Region.setGymName(gym, name, Gym)
                          .catch(error => msg.say("An error occurred setting the name of this gym.")
                            .catch(err => log.error(err)));
                        if (result["id"]) {
                          that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                          Region.showGymDetail(msg, result, "Updated Gym Name", msg.member.displayName, false)
                            .catch(err => log.error(err));
                        }
                      } else {
                        that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                      }
                    });
                } else if (value === 'nickname') {
                  that.nicknameCollector.obtain(msg)
                    .then(async collectionResult => {
                      if (!collectionResult.cancelled) {
                        const nickname = collectionResult.values["nickname"];
                        const result = await Region.setGymNickname(gym, nickname, Gym)
                          .catch(error => msg.say("An error occurred setting the nickname of this gym.")
                            .catch(err => log.error(err)));
                        if (result["id"]) {
                          that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                          Region.showGymDetail(msg, result, "Updated Gym Nickname", msg.member.displayName, false)
                            .catch(err => log.error(err));
                        }
                      } else {
                        that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                      }
                    });
                } else if (value === 'description') {
                  that.descriptionCollector.obtain(msg)
                    .then(async collectionResult => {
                      if (!collectionResult.cancelled) {
                        const description = collectionResult.values["description"];
                        const result = await Region.setGymDescription(gym, description, Gym)
                          .catch(error => msg.say("An error occurred setting the description of this gym.")
                            .catch(err => log.error(err)));
                        if (result["id"]) {
                          that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                          Region.showGymDetail(msg, result, "Updated Gym Description", msg.member.displayName, false)
                            .catch(err => log.error(err));
                        }
                      } else {
                        that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                      }
                    });
                } else if (value === 'keywords') {
                  that.keywordsCollector.obtain(msg)
                    .then(async collectionResult => {
                      if (!collectionResult.cancelled) {
                        log.info("action: " + collectionResult.values["keywords"]["action"]);
                        log.info("keywords: " + collectionResult.values["keywords"]["keywords"]);

                        const action = collectionResult.values["keywords"]["action"];
                        const keywords = collectionResult.values["keywords"]["keywords"];
                        const result = await Region.editGymKeywords(gym, action, keywords, Gym)
                          .catch(error => msg.say("An error occurred adding removing keywords from the gym.")
                            .catch(err => log.error(err)));
                        if (result["id"]) {
                          that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                          Region.showGymDetail(msg, result, "Updated Gym Keywords", msg.member.displayName, false)
                            .catch(err => log.error(err));
                        }
                      } else {
                        that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                      }
                    });
                } else if (value === 'exraid') {
                  that.exTagCollector.obtain(msg)
                    .then(async tagResult => {
                      if (!tagResult.cancelled) {
                        that.exPreviousCollector.obtain(msg)
                          .then(async previousResult => {
                            if (!previousResult.cancelled) {
                              const tagged = tagResult.values["extag"];
                              const previous = previousResult.values["exprevious"];

                              const isTagged = tagged.toLowerCase() === "yes" || tagged.toLowerCase() === "y";
                              const isPrevious = previous.toLowerCase() === "yes" || previous.toLowerCase() === "y";

                              const result = await Region.setEXStatus(gym, isTagged, isPrevious, Gym)
                                .catch(error => msg.say("An error occurred setting the EX eligibility of This gym.")
                                  .catch(err => log.error(err)));
                              if (result["id"]) {
                                that.cleanup(msg, [gymResult, fieldResult, tagResult, previousResult], gymMessage);
                                Region.showGymDetail(msg, result, "Updated EX Raid Eligibility", msg.member.displayName, false)
                                  .catch(err => log.error(err));
                              }
                            } else {
                              previousResult.prompts.forEach(message => {
                                message.delete()
                                  .catch(err => log.error(err));
                              });
                              that.cleanup(msg, [gymResult, fieldResult, tagResult, previousResult], gymMessage);
                            }
                          });
                      } else {
                        that.cleanup(msg, [gymResult, fieldResult, tagResult], gymMessage);
                      }
                    });
                } else if (value === 'notice') {
                  that.noticeCollector.obtain(msg)
                    .then(async collectionResult => {
                      if (!collectionResult.cancelled) {
                        const notice = collectionResult.values["notice"];
                        const result = await Region.setGymNotice(gym, notice, Gym)
                          .catch(error => msg.say("An error occurred setting the notice for this gym.")
                            .catch(err => log.error(err)));
                        if (result["id"]) {
                          that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                          Region.showGymDetail(msg, result, "Updated Gym Notice", msg.member.displayName, false);
                        }
                      } else {
                        that.cleanup(msg, [gymResult, fieldResult, collectionResult], gymMessage);
                      }
                    });
                }
              } else {
                that.cleanup(msg, [gymResult, fieldResult], gymMessage);
              }
            });
        } else {
          that.cleanup(msg, [gymResult], null);
        }
      });
  }
};
