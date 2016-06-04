const Console = console.Console;
const fs = require('fs');

class Logger {
	constructor(prefix, level, filePath) {
		switch (level) {
			case 'i' :
			case 'l' :
			{
				this.level = 3;
			}
				break;
			case 'w' : {
				this.level = 2;
			}
				break;
			case 'e' : {
				this.level = 1;
			}
				break;
			default : {
				this.level = 0;
			}
		}
		this.prefix = prefix ? prefix + ' ':'';
		if (filePath) {
			const output = fs.createWriteStream(filePath);
			this.custom = new Console(output, output);
			this.close = '';
			this.open = {
				l: 'LOG ',
				i: 'INFO ',
				s: 'SUCCESS ',
				w: 'WARN ',
				e: 'ERROR '
			}
		} else {
			this.custom = new Console(process.stdout, process.stderr);
			this.close = '';
			this.open = {
				l: '\u001b[30;1m',
				i: '\u001b[34;1m',
				s: '\u001b[32;1m',
				w: '\u001b[33;1m',
				e: '\u001b[31;1m'
			}
		}
	}

	l(message, ...args) {
		if (this.level > 2) this.custom.log(this.open.l + this.prefix + message + this.close, ...args);
	}

	i(message, ...args) {
		if (this.level > 2) this.custom.log(this.open.i + this.prefix + message + this.close, ...args);
	}

	s(message, ...args) {
		if (this.level > 2) this.custom.log(this.open.s + this.prefix + message + this.close, ...args);
	}

	w(message, ...args) {
		if (this.level > 1) this.custom.log(this.open.w + this.prefix + message + this.close, ...args)
	}

	e(message, ...args) {
		if (this.level > 0) this.custom.log(this.open.e + this.prefix + message + this.close, ...args)
	}

	c(checked, messageOk, messageNotOk,interrupt = true) {
		if (!checked) {
			if (interrupt) {
				this.custom.assert(checked, this.open.e + this.prefix + messageNotOk + this.close);
			}
			else {
				this.e(messageNotOk);
			}
		} else {
			this.s(messageOk);
		}
	}
}

module.exports = Logger;