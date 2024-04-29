# How Javascript Promise works

Here I implemented MyPromise class to mimic javascript built-in Promise.

When I read JS books, I was curious about how Promise class works. I believe the best way to understand it is to implement it.

If you read through and understand the first 300 lines of `my_promise.js`, you would fully understand how promise works.

There are several differences between MyPromise and the built-in Promise:

1. Since we can not operate JS micro-task queue. MyPromise.resolve()/MyPromise.reject() uses setTimeout(cb, 0) instead.
2. For the same reason, uncaught errors along a promise chain would just be ignored. While the built-in Promise will throw a global error in that case.
3. I only implement MyPromise.all() as an example. Interested readers may implement their own any()/race() etc.

If a reader agrees with term 2, or if a reader can implement his own any()/race(), then he SHOULD have a good idea of how built-in Promise works.