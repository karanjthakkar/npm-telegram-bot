const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
const parseUrl = require('github-url-to-object');
const GithubAPI = require('github');
const async = require('async');
    
const telegram = new TelegramBot(process.env.BOT_TOKEN, {
  'polling': true
});

const github = new GithubAPI();
github.authenticate({
  type: 'token',
  token: process.env.GITHUB_TOKEN
});

telegram.on('inline_query', (query) => {
  const searchQuery = query.query || '';
  if (searchQuery.trim() === '') {
    telegram.answerInlineQuery(query.id, [])
      .catch((err) => {
        console.log('Telegram: ', err);
      });
  } else {
    request(`https://api.npms.io/v2/search/suggestions?q=${encodeURIComponent(searchQuery)}`, (err, response, body) => {
      if (err) {
        console.log('Request: ', err);
        telegram.answerInlineQuery(query.id, [])
          .catch((err) => {
            console.log('Telegram: ', err);
          });
      } else {
        var results = JSON.parse(body);
        var usernameFetchQueue = [];
        results.forEach((package) => {
          package = package.package;
          const name = package.name;
          const parsedUrl = parseUrl(package.links.repository);
          const username = (
            (parsedUrl && parsedUrl.user) 
            || (package.author && package.author.username) 
            || (package.publisher && package.publisher.username)
          );
          usernameFetchQueue.push(fetchAvatarFromGithub(username));
        });
        async.parallel(usernameFetchQueue, function(err, avatarList) {
          results = results.map((package, index) => {
            package = package.package;
            const name = package.name;
            const packageUrl = package.links.npm;
            const description = package.description;
            return {
              'type': 'article',
              'id': name,
              'title': name,
              'description': description,
              'url': packageUrl,
              'thumb_url': avatarList[index],
              'input_message_content': {
                'message_text': packageUrl
              }
            };
          })
          telegram.answerInlineQuery(query.id, results)
            .catch((err) => {
              console.log('Telegram: ', err);
            });
        });
      }
    });
  }
});

function fetchAvatarFromGithub(username) {
  return (callback) => {
    if (!username) {
      return callback(null, '');
    }
    github.users.getForUser({
      username
    }, (err, result) => {
      if (err) {
        console.log('Github: ', err);
        callback(null, '');
      } else {
        callback(null, result.avatar_url);
      }
    });
  };
}