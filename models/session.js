var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var Session = new Schema({
    id: Number,
    nid: Number,
    room: {
        type: String,
        index: true
    },
    title: String,
    date: {
        type: Date,
        index: true
    },
    start: {
        type: Date,
        index: true
    },
    end: {
        type: Date,
        index: true
    },
});

module.exports = mongoose.model('session', Session);