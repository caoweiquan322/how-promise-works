/**
 * Here I implemented MyPromise class to mimic javascript built-in Promise.
 * If you read through and understand the first 300 lines of this file, you would fully understand
 * how promise works.
 * 
 * There are several differences between MyPromise and the built-in Promise:
 *   1. Since we can not operate JS micro-task queue. MyPromise.resolve()/MyPromise.reject() uses 
 *      setTimeout(cb, 0) instead.
 *   2. For the same reason, uncaught errors along a promise chain would just be ignored. While 
 *      the built-in Promise will throw a global error in that case.
 *   3. I only implement MyPromise.all() as an example. Interested readers may implement their own
 *      any()/race() etc.
 *
 * If a reader agrees with term 2, or if a reader can implement his own any()/race(), then he SHOULD 
 * have a good idea of how built-in Promise works.
 */

// Base class of MyPromise/ThenBlock/FinallyBlock.
class ChainBlockBase {
    // Just for DEBUG purpose.
    static DEBUG = false;
    static idGenerator = 0;
    _id = -1;

    // State.
    static STATE_WAIT_INPUT = 0;
    static STATE_PENDING = 1;
    static STATE_RESOLVED = 2;
    static STATE_REJECTED = 3;
    _state = this.STATE_WAIT_INPUT;
    _value_err = undefined;

    // Set feed callback to null by default.
    _onValueFeeded = null;
    _onErrorFeeded = null;

    // Cache early added sub blocks. So that we won't miss them!
    _subBlocksToFeed = [];
    _subBlocksToResolveReject = [];

    constructor() {
        this._id = ChainBlockBase.idGenerator++;
        this._state = ChainBlockBase.STATE_WAIT_INPUT;
        this._value_err = null;
    }

    _addSubBlockToFeed(blk) {
        if (this._state === ChainBlockBase.STATE_RESOLVED) {
            blk._doFeedValue(this._value_err);
        } else if (this._state === ChainBlockBase.STATE_REJECTED) {
            blk._doFeedError(this._value_err);
        } else {
            this._subBlocksToFeed.push(blk);
        }
    }

    _addSubBlockToResolveReject(blk) {
        if (this._state === ChainBlockBase.STATE_RESOLVED) {
            blk._doResolve(this._value_err);
        } else if (this._state === ChainBlockBase.STATE_REJECTED) {
            blk._doReject(this._value_err);
        } else {
            this._subBlocksToResolveReject.push(blk);
        }
    }

    _doFeedValue(value) {
        if (ChainBlockBase.DEBUG) {
            console.log(`[-] Block[${this._id}] _doFeedValue(${value})`);
        }
        if (this._state !== ChainBlockBase.STATE_WAIT_INPUT) {
            console.warn(`[!] ChainBlockBase state must be STATE_WAIT_INPUT before feeding data.`);
            return;
        }
        this._state = ChainBlockBase.STATE_PENDING;
        if (this._onValueFeeded) {
            this._onValueFeeded(value);
        }
    }

    _doFeedError(err) {
        if (ChainBlockBase.DEBUG) {
            console.log(`[-] Block[${this._id}] _doFeedError(${err})`);
        }
        if (this._state !== ChainBlockBase.STATE_WAIT_INPUT) {
            console.warn(`[!] ChainBlockBase state must be STATE_WAIT_INPUT before feeding data.`);
            return;
        }
        this._state = ChainBlockBase.STATE_PENDING;
        if (this._onErrorFeeded) {
            this._onErrorFeeded(err);
        }
    }

    _doResolve(value) {
        if (ChainBlockBase.DEBUG) {
            console.log(`[-] Block[${this._id}] doResolve(${value})`);
        }
        if (this._state !== ChainBlockBase.STATE_PENDING) {
            console.warn(`[!] ChainBlockBase state must be STATE_PENDING before resolve()/reject().`);
            return;
        }
        this._value_err = value;
        this._state = ChainBlockBase.STATE_RESOLVED;

        // Handle existing sub blocks.
        while (this._subBlocksToFeed.length > 0) {  // Feed so that sub block may handle.
            this._subBlocksToFeed.pop()._doFeedValue(value);
        }
        while (this._subBlocksToResolveReject.length > 0) {  // Propagate down side.
            this._subBlocksToResolveReject.pop()._doResolve(value);
        }
    }

    _doReject(err) {
        if (ChainBlockBase.DEBUG) {
            console.log(`[-] Block[${this._id}] _doReject(${err})`);
        }
        if (this._state !== ChainBlockBase.STATE_PENDING) {
            console.warn(`[!] ChainBlockBase state must be STATE_PENDING before resolve()/reject().`);
            return;
        }
        this._value_err = err;
        this._state = ChainBlockBase.STATE_REJECTED;

        // Handle existing sub blocks.
        while (this._subBlocksToFeed.length > 0) {  // Feed so that sub block may handle.
            this._subBlocksToFeed.pop()._doFeedError(err);
        }
        while (this._subBlocksToResolveReject.length > 0) {  // Propagate down side.
            this._subBlocksToResolveReject.pop()._doReject(err);
        }
    }

    then(resolveHandler, rejectHandler=null) {
        let blk = new ThenBlock(resolveHandler, rejectHandler);
        this._addSubBlockToFeed(blk);
        return blk;
    }

    catch(rejectHandler) {
        return this.then(null, rejectHandler);
    }

    finally(finalHandler) {
        let blk = new FinallyBlock(finalHandler);
        this._addSubBlockToFeed(blk);
        return blk;
    }
}


class ThenBlock extends ChainBlockBase {
    constructor(prevResolveHandler, prevRejectHandler) {
        super();
        this._onValueFeeded = (value) => {
            if (prevResolveHandler) {
                try {
                    let result = prevResolveHandler(value);
                    if (!(result instanceof MyPromise)) {
                        result = MyPromise.resolve(result);
                    }
                    // This block will resolve/reject later after result resolved/rejected.
                    result._addSubBlockToResolveReject(this);
                } catch (err2) {
                    this._doReject(err2);
                }
            } else {
                this._doResolve(value);  // Use this value transparently.
            }
        };
        this._onErrorFeeded = (err) => {
            if (prevRejectHandler) {
                try {
                    let result = prevRejectHandler(err);
                    if (!(result instanceof MyPromise)) {
                        result = MyPromise.resolve(result);
                    }
                    // This block will resolve/reject later after result resolved/rejected.
                    result._addSubBlockToResolveReject(this);
                } catch (err2) {
                    this._doReject(err2);
                }
            } else {
                this._doReject(err);  // Use this error transparently.
            }
        };
    }
}

class FinallyBlock extends ChainBlockBase {
    constructor(prevFinalHandler) {
        super();
        this._onValueFeeded = (value) => {
            try {
                if (prevFinalHandler) {
                    prevFinalHandler();  // Final handler has no parameter.
                }
                this._doResolve(value);
            } catch(err2) {
                this._doReject(err2);
            }
        };
        this._onErrorFeeded = (err) => {
            try {
                if (prevFinalHandler) {
                    prevFinalHandler();  // Final handler has no parameter.
                }
                this._doReject(err);
            } catch(err2) {
                this._doReject(err2);
            }
        }
    }
}


class MyPromise extends ChainBlockBase {
    // (resolve: (value)=>{}, reject: (err)=> {}) => {}
    constructor(resolveRejectExecutor) {
        super();

        // Explicitly created Promise has no feeding data. So set state to PENDING directly.
        this._state = ChainBlockBase.STATE_PENDING;

        // The creator just calls the executor instantly.
        // The executor will call resolve/reject at correct time (in the future).
        // The Promise object does not call resolve/reject itself! The executor does.
        try {
            resolveRejectExecutor(this._doResolve.bind(this), this._doReject.bind(this));
        } catch (err) {
            this._doReject(err);
        }
    }

    // Create a promise, which calls resolve(value) very soon.
    static resolve(value) {
        // Note&TODO: ES5 implementation uses micro-task instead of setTimeout(cb, 0);
        return new MyPromise((resolve, reject)=> {
            setTimeout(()=> {
                resolve(value);
            }, 0);
        });
    }

    // Create a promise, which calls reject(err) very soon.
    static reject(err) {
        // Note&TODO: ES5 implementation uses micro-task instead of setTimeout(cb, 0);
        return new MyPromise((resolve, reject)=> {
            setTimeout(()=> {
                reject(err);
            }, 0);
        });
    }

    static all(promises) {
        return new MyPromise((resolve, reject)=> {
            let errorOccurs = false;
            let numUnResolved = promises.length;
            let values = [];
            for (let [idx, prom] of promises.entries()) {
                values.push(undefined);  // Initialize values[idx] with undefined.
                if (!(prom instanceof MyPromise)) {
                    // Fill the value to result array directly.
                    values[idx] = prom;
                    numUnResolved--;
                    // Check.
                    if (numUnResolved <= 0 && !errorOccurs) {
                        resolve(values);
                    }
                } else {
                    prom.then((val)=> {
                        values[idx] = val;
                        numUnResolved--;
                        // Check.
                        if (numUnResolved <= 0 && !errorOccurs) {
                            resolve(values);
                        }
                    }).catch((err)=> {
                        errorOccurs = true;
                        reject(err);
                    });
                }
            }
        });
    }

    // TODO: Readers may implement allSettled()/race()/any() if they like.
}

// Hack print function.
print = console.log;
// You may enable DEBUG flag to see the details.
ChainBlockBase.DEBUG = false;
// Hack built-in Promise class.
let Promise = MyPromise;

function tst_main1() {
    print('Examples of then().');
    new Promise((resolve, reject)=> {
        resolve('HelloResolve');
    }).then((value)=> {
        print(`Print in then: ${value}`);
    });

    function printLater(msg) {
        return new Promise((resolve, reject) => {
            print('Before setTimeout.');
            setTimeout(()=> {
                print(`SetTimeout reached callback!`);
                resolve(msg);
            }, 0);
            print('After setTimeout');
        });
    }

    print('Before promise creation.');

    printLater('HelloPrintLater').then((value)=> {
        print(`Print in then: ${value}`);
        return printLater('HelloPrintLater2');
    }).then((value) => {
        print(`Print secondly in then: ${value}`);
    });

    print('After promise creation.');

    function resolveDirectly(msg) {
        return Promise.resolve(msg);
    }

    print('Before resolveDirectly.');

    resolveDirectly('HelloResolveDirectly').then((value)=> {
        print(`Print in then: ${value}`);
    });

    print('After resolveDirectly.');
}


function tst_main2() {
    print('Examples of then().');
    new Promise(function(resolve, reject) {
        setTimeout(() => resolve(1), 1000); // (*)
    }).then(function(result) { // (**)
        print(result); // 1
        return result * 2;
    }).then(function(result) { // (***)
        print(result); // 2
        return result * 2;
    }).then(function(result) {
        print(result); // 4
        return result * 2;
    });
}

function tst_main3() {
    print('Examples of then().');
    let promise = new Promise(function(resolve, reject) {
        setTimeout(() => resolve(1), 1000);
      });
      
      promise.then(function(result) {
        print(result); // 1
        return result * 2;
      });
      
      promise.then(function(result) {
        print(result); // 1
        return result * 2;
      });
      
      promise.then(function(result) {
        print(result); // 1
        return result * 2;
      });
}

function tst_main4() {
    print('Examples of then().');
    new Promise(function(resolve, reject) {
        setTimeout(() => resolve(1), 1000);
    }).then(function(result) {
        print(result); // 1
        return new Promise((resolve, reject) => { // (*)
          setTimeout(() => resolve(result * 2), 1000);
        });
    }).then(function(result) { // (**)
        print(result); // 2
        return new Promise((resolve, reject) => {
          setTimeout(() => resolve(result * 2), 1000);
        });
    }).then(function(result) {
        print(result); // 4
    });
}

function tst_main5() {
    print('Examples of catch(err).');

    // Catch thrown error.
    new Promise((resolve, reject) => {
        throw new Error("Whoops1!");
    }).catch(print); // Error: Whoops1!

    // Catch rejected error.
    new Promise((resolve, reject) => {
        reject(new Error("Whoops2!"));
    }).catch(print); // Error: Whoops2!

    // Catch then error.
    new Promise((resolve, reject) => {
        resolve("ok");
    }).then((result) => {
        throw new Error("Whoops3!"); // reject this promise
    }).catch(print); // Error: Whoops3!

    // General js error.
    new Promise((resolve, reject) => {
        resolve("ok");
    }).then((result) => {
        blabla(); // No such function.
    }).catch(print); // ReferenceError: blabla is not defined

    // Fixed error.
    new Promise((resolve, reject) => {
        throw new Error("Whoops4!");
    }).catch(function(error) {
        print("The error is handled, continue normally");
    }).then(() => print("Next successful handler runs"));

    // Error that can not be fixed.
    new Promise((resolve, reject) => {
        throw new Error("Whoops5!");
    }).catch(function(error) { // (*)
        if (error instanceof URIError) {
            // I can fix it.
        } else {
            print("Can't handle such error");
            throw error; // re-throw the unhandled error.
        }
    }).then(function() {
        print("We will never be here!");
    }).catch(error => { // (**)
        print(`The unknown error has occurred: ${error}`);
    });
}

function tst_main6() {
    print('Examples of uncaught error along promise chain.');
    // BE CAREFUL: In my mocked promise, this error would be omitted.
    // However, ES5 promise will throw it as an global error.
    new Promise(function() {
        throw new Error("Whoops!");
    }); // Missing catch()
}

function tst_main7() {
    print('Examples of Promise.all().');
    // Promise.all on 3 normal promise.
    Promise.all([
        new Promise(resolve => setTimeout(() => resolve(1), 3000)), // 1
        new Promise(resolve => setTimeout(() => resolve(2), 2000)), // 2
        new Promise(resolve => setTimeout(() => resolve(3), 1000))  // 3
    ]).then(print); // 1,2,3. Note that resolved values are ordered as their promise.

    // Promise.all with errors.
    Promise.all([
        new Promise((resolve, reject) => setTimeout(() => resolve(1), 1000)),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error("Whoops!")), 2000)),
        new Promise((resolve, reject) => setTimeout(() => resolve(3), 3000))
    ]).catch(print); // Error: Whoops! Promise 1/3 would be ignored.

    // Promise.all with non-promise types.
    Promise.all([
        new Promise((resolve, reject) => {
          setTimeout(() => resolve(4), 1000);
        }),
        5,
        6
    ]).then(print); // 4, 5, 6
}

tst_main7();

