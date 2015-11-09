/*
 *  LICENSE HERE
 *  MIT
 */

var mod_bunyan = require('bunyan');
var mod_config = require('config');
var mod_slack = require('slack-client');

var token = mod_config.get('slack.token');
var autoReconnect = true;
var autoMark = true;

var slack = new mod_slack(token, true, true);
var log = mod_bunyan.createLogger({
        name: 'trollbot',
        level: process.env['LOG_LEVEL'] || 'error',
        stream: process.stderr
    });
var demerits = {};
var merits = {}

function main() {
    slack.on('open', function _open() {
        log.info('Slack connection open.');
    });

    slack.on('message', function _message(message) {
        var channel = slack.getChannelGroupOrDMByID(message.channel);
        log.info('Incoming message: %j in channel %j', message, channel);

        var demeritMatch = message.text.match(/([A-Za-z0-9]+):( ?)demerit/);
        var meritMatch = message.text.match(/([A-Za-z0-9]+):( ?)merit/);
        if (demeritMatch) {
            var name = demeritMatch[1];
            demerits[name] = demerits[name] ? demerits[name] + 1 : 1;
            var count = demerits[name];

            log.info('Demerit issued to %s', name);
            channel.send('Demerit to ' + name + ' (count: ' + count + ')');
        } else if (meritMatch) {
            var name = meritMatch[1];
            merits[name] = merits[name] ? merits[name] + 1 : 1;
            var count = merits[name];
            
            log.info('Merit issued to %s', name);
            channel.send('Merit to ' + name + ' (count: ' + count + ')');
        }
    });

    slack.on('error', function _error(error) {
        log.error('Error: %s', error.toString());
    });

    slack.login();
}

main();
