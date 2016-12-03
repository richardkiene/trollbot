
/* Copyright (c) 2015 Richard Kiene
 *
 *
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 *
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 *
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

var mod_bunyan = require('bunyan');
var mod_config = require('config');
var mod_jsonfile = require('jsonfile');
var mod_util = require('util');
var mod_vasync = require('vasync');

var RtmClient = require('@slack/client').RtmClient;
var MemoryDataStore = require('@slack/client').MemoryDataStore;

var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var HELP_MESSAGE = [
    '@<username>: demerit         -- gives a user a demerit\n',
    '@<username>: merit           -- gives a user a merit\n',
    'merit                        -- gives last message user a merit\n',
    'demerit                      -- gives last message user a demerit\n',
    'self: demerit                -- give yourself a demerit\n',
    '@<botname>: stats            -- shows merit and demerit stats\n',
    '@<botname>: help             -- shows this message\n'
].join('');

function Trollbot() {
    var self = this;
    self.autoReconnect = true;
    self.autoMark = true;
    var bot = self.bot = {};
    var token = self.token = mod_config.get('slack.token');
    var rtmOpts = { logLevel: 'error', dataStore: new MemoryDataStore() };
    var slack = self.slack = new RtmClient(token, rtmOpts);
    var log = self.log = mod_bunyan.createLogger({
        name: 'trollbot',
        level: process.env['LOG_LEVEL'] || 'error',
        stream: process.stderr
    });

    var demeritsPath = './data/demerits.json';
    var meritsPath = './data/merits.json';
    var demerits = self.demerits = mod_jsonfile.readFileSync(demeritsPath);
    var merits = self.merits = mod_jsonfile.readFileSync(meritsPath);
    self.lastMessage = undefined;

    slack.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function _open() {
        log.info('Slack connection open.');
    });

    slack.on(CLIENT_EVENTS.RTM.AUTHENTICATED, function _auth(startData) {
        bot.id = startData.self.id;
        bot.name = startData.self.name;
        log.info('LoggedIn: self.id = %s self.name = %s', bot.id, bot.name);
    });

    slack.on(RTM_EVENTS.MESSAGE, function _(message) {
        log.info('Incoming message: %j', message);

        var text = message.text;
        log.debug('Message text: %s', text);

        self.collectStat(message, function (csErr) {
            if (csErr) {
                log.error(csErr, 'error collecting stat');
                return;
            }
            self.command(message, function (bcErr) {
                if (bcErr) {
                    log.error(bcErr, 'error handling bot command');
                    return;
                }
                self.lastMessage = message;
                return;
            });
        });
    });

    slack.on('error', function _error(error) {
        log.error('Error: %s', error.toString());
    });

    slack.start();

    setInterval(function _saveStats() {
        mod_jsonfile.writeFile(demeritsPath, demerits, function (err) {
            if (err) {
                log.error('Error saving demerits: %s', err);
            }
        });

        mod_jsonfile.writeFile(meritsPath, merits, function (err) {
            if (err) {
                log.error('Error saving merits: %s', err);
            }
        });

    }, 5000);
}

Trollbot.prototype.issueDemerit = function issueDemerit(sName, cId, cb) {
    var self = this;
    var demerits = self.demerits;
    var name = sName.toLowerCase();
    demerits[name] = demerits[name] ? demerits[name] + 1 : 1;
    var count = demerits[name];

    self.log.info('Demerit issued to %s', name);
    var sendStr = 'Demerit to ' + sName + ' (count: ' + count + ')';
    self.slack.sendMessage(sendStr, cId, function (sendErr) {
        if (sendErr) {
            self.log.error(sendErr, 'error sending message to slack');
        }
        cb(sendErr);
    });
};

Trollbot.prototype.issueMerit = function issueMerit(sName, cId, cb) {
    var self = this;
    var merits = self.merits;
    var name = sName.toLowerCase();
    merits[name] = merits[name] ? merits[name] + 1 : 1;
    var count = merits[name];

    self.log.info('Merit issued to %s', name);
    var sendStr = 'Merit to ' + sName + ' (count: ' + count + ')';
    self.slack.sendMessage(sendStr, cId, function (sendErr) {
        if (sendErr) {
            self.log.error(sendErr, 'error sending message to slack');
        }
        cb(sendErr);
    });
};

Trollbot.prototype.collectStat = function collectStat(message, cb) {
    var self = this;
    var cId = message.channel;
    var log = self.log;
    var lastMessage = self.lastMessage;
    var user;
    if (message && message.text) {
        var text = message.text;
        var demeritMatch = text.match(/([A-Za-z0-9]+):( ?)demerit/);
        var userDemeritMatch = text.match(/<@([A-Za-z0-9]+)>:( ?)demerit/);
        var meritMatch = text.match(/([A-Za-z0-9]+):( ?)merit/);
        var userMeritMatch = text.match(/<@([A-Za-z0-9]+)>:( ?)merit/);

        if (demeritMatch) {
            var name = demeritMatch[1];
            if (name.toLowerCase() === 'self') {
                name = self.slack.dataStore.getUserById(message.user).name;
            }
            self.issueDemerit(name, cId, function (err) {
                if (err) {
                    self.log.error(err, 'Error giving demerit');
                }
                cb(err);
                return;
            });
        } else if (userDemeritMatch) {
            user = self.slack.dataStore.getUserById(userDemeritMatch[1]);
            self.issueDemerit(user.name, cId, function (err) {
                if (err) {
                    self.log.error(err, 'Error giving demerit');
                }
                cb(err);
                return;
            });
        } else if (meritMatch) {
            self.issueMerit(meritMatch[1], cId, function (err) {
                if (err) {
                    self.log.error(err, 'Error giving demerit');
                }
                cb(err);
                return;
            });
        } else if (userMeritMatch) {
            user = self.slack.dataStore.getUserById(userMeritMatch[1]);
            self.issueMerit(user.name, cId, function (err) {
                if (err) {
                    self.log.error(err, 'Error giving demerit');
                }
                cb(err);
                return;
            });
        } else if (text.toLowerCase() === 'merit') {
            if (lastMessage) {
                user = self.slack.dataStore.getUserById(lastMessage.user);
                self.issueMerit(user.name, cId, function (err) {
                    if (err) {
                        self.log.error(err, 'Error giving demerit');
                    }
                    cb(err);
                    return;
                });
            } else {
                log.warn('Failure - merit - lastMessage: %j', lastMessage);
                cb(new Error('Failure to give merit'));
                return;
            }
        } else if (text.toLowerCase() === 'demerit') {
            if (lastMessage) {
                user = self.slack.dataStore.getUserById(lastMessage.user);
                self.issueDemerit(user.name, message.channel, function (err) {
                    if (err) {
                        self.log.error(err, 'Error giving demerit');
                    }
                    cb(err);
                    return;
                });
            } else {
                log.warn('Failure - demerit - lastMessage: %j', lastMessage);
                cb(new Error('Failure to give demerit'));
            }
        } else {
            log.debug(
                'no match found in text : %s', mod_util.inspect(message));
            cb(null);
            return;
        }
    }

    cb(null);
    return;
};

Trollbot.prototype.sendStats = function sendStats(cId, cb) {
    var self = this;
    var demerits = self.demerits;
    var merits = self.merits;
    var stats = 'Demerits\n------------\n';
    mod_vasync.forEachPipeline({
        'inputs': Object.keys(demerits),
        'func': function (user, next) {
            stats += user + ': ' + demerits[user] + '\n';
            next();
        }}, function (fepDemeritsErr) {
        if (fepDemeritsErr) {
            self.log(fepDemeritsErr, 'Error iterating demerits');
        }
        stats += '\n\n\nMerits\n------------\n';
    });

    mod_vasync.forEachPipeline({
        'inputs': Object.keys(merits),
        'func': function (user, next) {
            stats += user + ': ' + merits[user] + '\n';
            next();
        }}, function (fepMeritsErr) {
        if (fepMeritsErr) {
            self.log(fepMeritsErr, 'Error iterating merits');
            cb(fepMeritsErr);
        } else {
            self.slack.sendMessage(stats, cId, function (sErr) {
                if (sErr) {
                    self.log.error(sErr, 'error sending to slack');
                }
                cb(sErr);
            });
        }
    });
};

Trollbot.prototype.command = function command(message, cb) {
    var self = this;
    var text = message.text;
    var err;
    if (text) {
        var botHelpMatch = text.match(/<@([A-Za-z0-9]+)>:( ?)help/);
        var botStatsMatch = text.match(/<@([A-Za-z0-9]+)>:( ?)stats/);
        if (botHelpMatch && botHelpMatch[1] === self.bot.id) {
            self.slack.sendMessage(HELP_MESSAGE, message.channel);
            cb(err);
            return;
        } else if (botStatsMatch && botStatsMatch[1] === self.bot.id) {
            self.sendStats(message.channel, function (ssErr) {
                if (ssErr) {
                    cb(ssErr);
                    return;
                }
            });
        } else {
            self.log.info('No command match');
            cb(err);
            return;
        }
    } else {
        self.log.info('text was not set');
        cb(err);
        return;
    }
};

module.exports = Trollbot;
