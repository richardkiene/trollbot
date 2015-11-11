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
var mod_slack = require('slack-client');
var mod_util = require('util');

var token = mod_config.get('slack.token');
var bot = {};
var autoReconnect = true;
var autoMark = true;

var slack = new mod_slack(token, true, true);
var log = mod_bunyan.createLogger({
        name: 'trollbot',
        level: process.env['LOG_LEVEL'] || 'error',
        stream: process.stderr
    });
var demeritsPath = './data/demerits.json';
var meritsPath = './data/merits.json'
var demerits = mod_jsonfile.readFileSync(demeritsPath);
var merits = mod_jsonfile.readFileSync(meritsPath);
var lastMessage = undefined;

var helpMessage = [
    '@<username>: demerit         -- gives a user a demerit\n',
    '@<username>: merit           -- gives a user a merit\n',
    'merit                        -- gives last message user a merit\n',
    'demerit                      -- gives last message user a demerit\n',
    'self: demerit                -- give yourself a demerit\n',
    '@<botname>: stats            -- shows merit and demerit stats\n',
    '@<botname>: help             -- shows this message\n'
].join('');

function issueDemerit(showName, channel) {
    var name = showName.toLowerCase();
    demerits[name] = demerits[name] ? demerits[name] + 1 : 1;
    var count = demerits[name];

    log.info('Demerit issued to %s', name);
    channel.send('Demerit to ' + showName + ' (count: ' + count + ')');
}

function issueMerit(showName, channel) {
    var name = showName.toLowerCase();
    merits[name] = merits[name] ? merits[name] + 1 : 1;
    var count = merits[name];

    log.info('Merit issued to %s', name);
    channel.send('Merit to ' + showName + ' (count: ' + count + ')');
}

function collectStat(message, channel) {
    if (message && message.text) {
        var text = message.text;
        var demeritMatch = text.match(/([A-Za-z0-9]+):( ?)demerit/);
        var userDemeritMatch = text.match(/<@([A-Za-z0-9]+)>:( ?)demerit/);
        var meritMatch = text.match(/([A-Za-z0-9]+):( ?)merit/);
        var userMeritMatch = text.match(/<@([A-Za-z0-9]+)>:( ?)merit/);

        if (demeritMatch) {
            var name = demeritMatch[1];
            if (name.toLowerCase() === 'self') {
                name = slack.getUserByID(message.user).name;
            }
            issueDemerit(name, channel);
        } else if (userDemeritMatch) {
            var user = slack.getUserByID(userDemeritMatch[1]);
            issueDemerit(user.name, channel);
        } else if (meritMatch) {
            issueMerit(meritMatch[1], channel);
        } else if (userMeritMatch) {
            var user = slack.getUserByID(userMeritMatch[1]);
            issueMerit(user.name, channel);
        } else if (text.toLowerCase() === 'merit') {
            if (lastMessage) {
                var user = slack.getUserByID(lastMessage.user);
                issueMerit(user.name, channel);
            } else {
                log.warn('Failure - merit - lastMessage: %j', lastMessage);
            }
        } else if (text.toLowerCase() === 'demerit') {
            if (lastMessage) {
                var user = slack.getUserByID(lastMessage.user);
                issueDemerit(user.name, channel);
            } else {
                log.warn('Failure - demerit - lastMessage: %j', lastMessage);
            }
        } else {
            log.warn(
                'message or message.text was not set: %s',
                mod_util.inspect(message));
        }
    }
}

function sendStats(channel) {
    stats = 'Demerits\n------------\n';
    for (var user in demerits) {
        if (demerits.hasOwnProperty(user)) {
           stats += user + ': ' + demerits[user] + '\n';
        }
    }

    stats += '\n\n\nMerits\n------------\n';
    for (var user in merits) {
        if (merits.hasOwnProperty(user)) {
           stats += user + ': ' + merits[user] + '\n';
        }
    }

    channel.send(stats);
}

function botCommand(message, channel) {
    var text = message.text;
    if (text) {
        var botHelpMatch = text.match(/<@([A-Za-z0-9]+)>:( ?)help/);
        var botStatsMatch = text.match(/<@([A-Za-z0-9]+)>:( ?)stats/);
        if (botHelpMatch && botHelpMatch[1] === bot.id) {
            channel.send(helpMessage);
        } else if (botStatsMatch && botStatsMatch[1] === bot.id) {
            sendStats(channel);
        }
    } else {
        log.info('text was not set');
    }
}

function main() {
    slack.on('open', function _open() {
        log.info('Slack connection open.');
    });

    slack.on('loggedIn', function _loggedIn(self, team) {
        log.info('LoggedIn: self.id = %s self.name = %s', self.id, self.name);
        bot.id = self.id;
        bot.name = self.name;
    });

    slack.on('message', function _message(message) {
        var channel = slack.getChannelGroupOrDMByID(message.channel);
        log.info('Incoming message: %j', message);

        var text = message.text;
        log.debug('Message text: %s', text);

        collectStat(message, channel);
        botCommand(message, channel);
        lastMessage = message;
    });

    slack.on('error', function _error(error) {
        log.error('Error: %s', error.toString());
    });

    slack.login();

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

main();
