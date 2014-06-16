var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var Vote = new Schema({
    nfcUid: String,
    rating: String,
    room: String,
    sessionTitle: String,
    sessionId: String,
    userName: String,
    userEmail: String
});

module.exports = mongoose.model('vote', Vote);