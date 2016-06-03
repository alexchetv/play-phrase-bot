class Logger {
	constructor(prefix) {

		this.prefix = prefix;
	}

	log(message, ...args) {
		console.log('\u001b[30;1m' + (this.prefix ? this.prefix + ' ':'') + message + '\u001b[39m', ...args);
	}

	info(message, ...args) {
		console.log('\u001b[34;1m' + (this.prefix ? this.prefix + ' ':'') + message + '\u001b[39m', ...args);
	}

	success(message, ...args) {
		console.log('\u001b[32;1m' + (this.prefix ? this.prefix + ' ':'') + message + '\u001b[39m', ...args);
	}

	warn(message, ...args) {
		console.log('\u001b[33;1m' + (this.prefix ? this.prefix + ' ':'') + message + '\u001b[39m', ...args)
	}

	err(message, ...args) {
		console.log('\u001b[31;1m' + (this.prefix ? this.prefix + ' ':'') + message + '\u001b[39m', ...args)
	}
}

module.exports = Logger;