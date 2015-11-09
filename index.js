/*
 *  LICENSE HERE
 *  MIT
 */

var mod_bunyan = require('bunyan');
var mod_config = require('config');
var mod_jsonfile = require('jsonfile');
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
var demeritsPath = './data/demerits.json';
var meritsPath = './data/merits.json'
var demerits = mod_jsonfile.readFileSync(demeritsPath);
var merits = mod_jsonfile.readFileSync(meritsPath);

function main() {
    slack.on('open', function _open() {
        log.info('Slack connection open.');
    });

    slack.on('message', function _message(message) {
        var channel = slack.getChannelGroupOrDMByID(message.channel);
        log.info('Incoming message: %j', message);

        var demeritMatch = message.text.match(/([A-Za-z0-9]+):( ?)demerit/);
        var meritMatch = message.text.match(/([A-Za-z0-9]+):( ?)merit/);
        log.debug('demeritMatch: %j', demeritMatch);
        log.debug('meritMatch: %j', meritMatch);
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
