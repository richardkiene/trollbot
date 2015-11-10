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
            var showName = demeritMatch[1];
            var name = showName.toLowerCase();
            demerits[name] = demerits[name] ? demerits[name] + 1 : 1;
            var count = demerits[name];

            log.info('Demerit issued to %s', name);
            channel.send('Demerit to ' + showName + ' (count: ' + count + ')');
        } else if (meritMatch) {
            var showName = meritMatch[1];
            var name = showName.toLowerCase();
            merits[name] = merits[name] ? merits[name] + 1 : 1;
            var count = merits[name];

            log.info('Merit issued to %s', name);
            channel.send('Merit to ' + showName + ' (count: ' + count + ')');
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
