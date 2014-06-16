var mqtt = require('mqtt')

var request = require('request');
var request = request.defaults({
    strictSSL: false // TODO remove in prod?
})


var removeDiacritics = require('diacritics').remove;

var express = require('express'),
    stylus = require('stylus'),
    nib = require('nib');
// middlewares
var compress = require('compression');
var morgan = require('morgan');
var cors = require('cors');

var path = require('path');
var mongoose = require('mongoose');

var utils = require('./utils');
var models = require('./models');

var Schema = mongoose.Schema;

// Connect to the Mongo instance
mongoose.connect('mongodb://localhost/eclipseconfrance2014');

var ECLIPSECON_BASE_URL = "https://www.eclipsecon.local"
//var ECLIPSECON_BASE_URL = "https://www.eclipsecon.org/france2014"

var username = "admin";
var password = "givememypasswordback";

// Create the app and listen for API requests
var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(morgan()); // logger
app.use(compress());
app.use(cors());

app.listen(3335);
console.log('Server listening on port 3334.');


/*****************************
 * Import EclipseCon sessions
 *****************************/

request(ECLIPSECON_BASE_URL + '/api/1.0/eclipsecon_scheduled_sessions', function(error, response, body) {
    if (!error && response.statusCode == 200) {
        models.SessionModel.remove().exec();
        var sessions = JSON.parse(body);
        sessions.forEach(function(s) {
            var session = new models.SessionModel();
            session.id = s.id;
            session.nid = s.nid;
            session.title = s.title;
            session.room = removeDiacritics(s.room).toLowerCase();
            session.date = new Date(s.date);
            session.start = new Date(s.start);
            session.end = new Date(s.end);

            session.save();
        })
        console.log("Sessions successfuly imported");
    }
});


/*****************************
 * Login to EclipseCon website
 *****************************/

var options = {
    uri: ECLIPSECON_BASE_URL + '/api/1.0/user/login',
    method: 'POST',
    json: {
        username: username,
        password: password
    }
};

var X_CSRF_TOKEN;
var SESSID;
var SESSION_NAME;
request(options,
    function(error, response, res) {
        if (!error && response.statusCode == 200) {
            console.log("Login for '" + username + "': OK");
            SESSID = res.sessid;
            SESSION_NAME = res.session_name;

            // Retrieve CSRF-Token
            options = {
                uri: ECLIPSECON_BASE_URL + "/services/session/token",
                headers: {
                    'Cookie': SESSION_NAME + '=' + SESSID
                }
            }
            request(options, function(error, response, body) {
                if (!error && response.statusCode == 200) {
                    X_CSRF_TOKEN = body;
                    console.log("X_CSRF_TOKEN: " + X_CSRF_TOKEN);
                } else {
                    throw new Error("couldn't retrieve CSRF token");

                }
            })

        } else {
            console.log("Login for '" + username + "': FAIL");
            console.log(error)
        }
    });


/************************
 * Monitor MQTT votes
 ************************/

client = mqtt.createClient(1883, 'iot.eclipse.org');
var topic = 'nfc-vote/#';
client.subscribe(topic);

console.log("Now listening to MQTT messages on '" + topic + "'");

function random(low, high) {
    return Math.random() * (high - low) + low;
}

client.on('message', function(topic, message) {
    var voteMessage = JSON.parse(message);
    var room = topic.split('/')[1].toLowerCase();

    // TODO use a key?

    // TEMP CHEATING ON THE TS
    voteDate = new Date(voteMessage.ts * 1000);
    voteDate.setDate(18);
    voteDate.setHours(random(10, 18));
    voteDate.setMinutes(random(0, 59));
    voteMessage.ts = voteDate.getTime();

    // Find current session in the room
    models.SessionModel.findOne({
        start: {
            $lt: new Date(voteMessage.ts)
        },
        end: {
            $gt: new Date(voteMessage.ts - 5 * 60 * 1000) // look for talks that ended less than 5min ago
        },
        room: room
    }, function(err, session) {
        if (session) {
            console.log("Current session in room " + room + ": " + session)

            // Find user associated to the NFC tag
            models.UserModel.findOne({
                nfcUid: voteMessage.nfcUid
            }, function(err, user) {
                if (user) {
                    console.log('found user for tag ' + voteMessage.nfcUid + '-- > ' + user.email)

                    // Vote on behalf of the user
                    // 1. Record the vote locally.
                    var vote = new models.VoteModel();
                    vote.nfcUid = voteMessage.nfcUid;
                    vote.rating = voteMessage.vote;
                    vote.room = room;
                    vote.sessionTitle = session.title,
                    vote.sessionId = session.nid;
                    vote.userName = user.name;
                    vote.userEmail = user.email;

                    vote.save();

                    // 2. POST it to EclipseCon website
                    var options = {
                        uri: ECLIPSECON_BASE_URL + '/api/1.0/eclipsecon_evaluations',
                        method: 'POST',
                        headers: {
                            'X-CSRF-Token': X_CSRF_TOKEN,
                            'Cookie': SESSION_NAME + '=' + SESSID
                        },
                        json: {
                            "email": user.email,
                            "session_id": session.nid,
                            "comment": "** Vote from the voting machine **",
                            "rating": (voteMessage.vote > 0 ? "+" : "") + voteMessage.vote
                        }
                    };
                    console.log(options.json)
                    request(options, function(error, response, body) {
                        if (!error && response.statusCode == 200) {
                            console.log('!!VOTE SUCCESSFUL!!')
                        } else {
                            console.log('!!VOTE FAIL!! --> ');
                            console.log(body);
                        }
                    });

                    // 3. Publish the vote on the MQTT broker
                    // first we anonmyze the vote by removing some fields
                    vote = vote.toObject();
                    client.publish('ecf2014/votes/' + room, JSON.stringify({
                        sessionId: session.nid,
                        session: session.title,
                        rating: voteMessage.vote
                    }));


                } else {
                    console.log('no user found for tag ' + voteMessage.nfcUid)
                }
            });

        } else {
            console.log("No session in room " + room + " at the moment. Vote will be discarded.")
        }
    });



});