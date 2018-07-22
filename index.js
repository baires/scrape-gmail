/**
 * 
 * Search GMail for messages, then write them to a folder as .txt files.
 * Will start a server on http://localhost:3000/login which should send you
 * to authorize the app to access your email.  Once you do that, the folder 
 * should populate and "OK" will be returned to the browser.  Errors are logged
 * to the server console.
 * 
 */

 // Where to put the email
const DIR = '/Users/jamin/Desktop/mail/';

// Function to name files, m is a google.gmail.users.Message
// https://developers.google.com/gmail/api/v1/reference/users/messages#resource
const filename = (m) => `${m.data.id}.txt`;

// What to search for - use the search in GMail web UI
// to find what you're looking for, then paste it here.
// emails that are verbatim identical are deduplicated.
const q = 'from: me@example.com send me these emails';

// What to put into the generated file
// m is a google.gmail.users.Message as with filename
// body is the decoded body of the message
const writeEmail = (m, body) => `${moment(m.data.internalDate, 'x').format()}\n\n${body}`;

// Port to listen on.  This affects how the GMail API credentials are configured
// (see ./client_id.json)
const PORT = 3000;

const express = require('express');
const config = require('./client_id.json').web;
const { google } = require('googleapis');
const moment = require('moment');
const crypto = require('crypto');
const fs = require('fs');

const SCOPES = [ 'https://www.googleapis.com/auth/gmail.readonly' ];

const app = express();

const oAuth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    config.redirect_uris[0]
);

var gmail;

function getMessages(callback, pageToken = null, result = []) {

    let args = { userId: 'me', q };

    if (pageToken) {
        args['pageToken'] = pageToken;
    }

    gmail.users.messages.list(args, (err, ret) => {

        if (err) {
            throw err;
        }

        if (ret.data.resultSizeEstimate === 0) {
            callback([]);
            return;
        }

        result.push(...ret.data.messages);

        if (ret.data.nextPageToken) {
            getMessages(callback, ret.data.nextPageToken, result);
        } else {
            callback(result);
        }

    });
}

function getMessage(id) {
    return new Promise((res, rej) => {

        gmail.users.messages.get({
            userId: 'me',
            id
        }, (err, ret) => {

            if (err) {
                rej(err);
                return;
            }

            res(ret);

        });
    });
}

app.get('/login', (req, res) => {

    const authUrl = oAuth2Client.generateAuthUrl({
        scope: SCOPES
    });

    res.redirect(authUrl);

});

app.get('/callback', (req, res) => {

    let code = req.query.code;

    oAuth2Client.getToken(code, (err, token) => {

        if (err) {
            throw err;
        }

        oAuth2Client.setCredentials(token);

        res.redirect('/emails');
        
    });

});

app.get('/emails', (req, res) => {

    gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    getMessages((result) => {

        let proms = result.map((x) => getMessage(x.id));

        Promise.all(proms).then((messages) => {

            let seen = [];

            messages.forEach((m) => {

                let msgBody = m.data.payload.body;

                // grab the first part out of multipart messages
                if (m.data.payload.mimeType === 'multipart/alternative') {
                    msgBody = m.data.payload.parts[0].body;
                }

                let body = Buffer.from(msgBody.data, 'base64').toString();
                let sha = crypto.createHash('sha1').update(body).digest('hex');

                if (seen.includes(sha)) {
                    return;
                }

                seen.push(sha);

                fs.open(`${DIR}${filename(m)}`, 'w', (err, fd) => {
                    
                    if (err) {
                        throw err;
                    }

                    fs.writeSync(fd, writeEmail(m, body));

                });
                
            });

            res.header('Content-Type', 'text/plain');
            res.send('OK');
        });

    });
    

});

app.listen(PORT, () => console.log('running'));
