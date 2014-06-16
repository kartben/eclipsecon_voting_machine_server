var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var User = new Schema({
	nfcUid: String,
	name: String,
	email: String,
});

module.exports = mongoose.model('user', User);