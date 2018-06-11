// src/promiseHelpers.js
//
// Copyright (c) 2018 Endless Mobile Inc.
//
// Helper methods to make promises and Gio more convenient
//

function promisifyGIO(obj, funcName, finishName, ...args) {
    return new Promise((resolve, reject) => {
        try {
            obj[funcName](...args, function(source, result) {
                try {
                    resolve(obj[finishName](result));
                } catch (e) {
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

function allSettledPromises(promises) {
    // Return a Promise.all of promises that always resolve, however they
    // resolve with tuples of error and result pairs. It is up to the
    // consumer to deal with the errors as they come in.
    return Promise.all(promises.map((promise) => {
        return new Promise(function(resolve) {
            try {
                promise.then(result => resolve([null, result]))
                .catch(e => resolve([e, null]));
            } catch (e) {
                logError(e, 'Something went wrong in allSettledPromises resolution');
                resolve([e, null]);
            }
        });
    }));
}

function complainAboutErrors(msg, skip_error_types=[]) {
    return ([error, result]) => {
        if (error != null) {
            if (!skip_error_types.some(([domain, code]) => error.matches(domain, code)))
                logError(error, msg);
            return false;
        }

        return true;
    }
}

function filterOutErrorsAndComplain(iterable, msg, skip_error_types=[]) {
    return iterable.filter(complainAboutErrors(msg, skip_error_types)).map(([_, result]) => result);
}
