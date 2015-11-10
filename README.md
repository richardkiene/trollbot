# trollbot
### Slack bot for facilitating humorous interaction and stats tracking

## Install & Run

1. Clone the repo to the location you'd like to run it from.
```
$ git clone https://github.com/richardkiene/trollbot.git
```
2. Setup your configuration and data files (replace values as necessary).
```
$ cp ./config/default.example ./config/default.json
$ cp ./data/demerits.example ./data/demerits.json
$ cp ./data/merits.example ./data/merits.json
```
3. Start the server (You may want to use something like SMF or upstart).
```
$ node index.js --abort-on-uncaught-exception
```
4. If you'd like to get detailed output pipe to bunyan
```
$ node index.js | bunyan --color
```
***
## Commands

```
@<username>: demerit         -- gives a user a demerit
@<username>: merit           -- gives a user a merit
merit                        -- gives last message user a merit
demerit                      -- gives last message user a demerit
self: demerit                -- give yourself a demerit
@<botname>: stats            -- shows merit and demerit stats
@<botname>: help             -- shows this message
```
***
* Note: trollbot currently persists stats data on a 5 second interval. If you're
  super worried about your stats data, make the interval shorter, or buy me a
  beer and I'll do something fancier.
