class Buffer {
	constructor() {

		this.data = [];
	}
	enqueue(item) {
		this.data.push(item);
		return this;
	}
	dequeue() {
		if (this.data[0]) {
			this.data[0].hasNext = (this.data.length > 1)
		}
		return this.data.shift();
	}
	peek() {
		return this.data[0];
	}
	clear() {
		this.data = [];
	}
	has(item) {
		for(let i = 0; i < this.size; i++) {
			if (item === this.data[i]) {
				return true;
			}
		}
		return false;
	}
	get size() {
		return this.data.length;
	}
	forEach(callback, thisArg) {
		for (const item of this) {
			callback.call(thisArg, item, this);
		}
	}
}

module.exports = Buffer;