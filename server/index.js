const express = require('express');
const parser = require('body-parser');
const axios = require('axios');
const bcrypt = require('bcrypt');
const helpers = require('./helpers.js');
const path = require('path');

const config = require ('../config.js');
const db = require('../database/index.js')

let app = express();

app.use(parser.json());
app.use(parser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/../client/dist'));

// Express sessions
var session = require('express-session')({
  secret: 'keyboard cat',
})
app.use(session)

//restricts access to certain endpoints for users who are not signed up
var restrict = (req, res, next) => {
  console.log('restricting request');
  console.log('session: ', req.session);
  if ((req.session !== undefined) && (req.session.user !== undefined)) {
      console.log('authenticated user ', req.session.user)
      next()
  } else {
      console.log('Errror, auth failed, redirecting to /')
      res.redirect('/')
  }
}

//on componentDidMount runs a get request to this endpoint to check if a user has a session
app.get('/isloggedin', (req, res) => {
  res.send(!!req.session && !!req.session.user);
})

app.post('/signup', (req, res) => {
  let username = req.body.username;
  let password = req.body.password;
  let email = req.body.email;
  console.log('signup request', username, password, email);
  // check that username and password are valid
  //fields need to be populated
  if (username === null || password === null || email === null) {
    console.log('user fields invalid');
    res.status(400).send('user fields invalid');
  }
  let salt;
  db.findUser(username)
    .then(dbres => {
      // check that username does not already exist
      console.log(dbres)
      if (dbres.length > 0) {
        console.log('username already exists, cannot sign up', username);
        throw('user already exists');
      }
      return bcrypt.genSalt(10);
    })
    .then(saltResult => {
      salt = saltResult;
      return bcrypt.hash(password, salt);
    })
    .then(hash => {
      //after chaining promises for creating a salt and password creates a new user
      return db.createUser(username, hash, salt, email);
    })
    .then(dbres => {
      return req.session.regenerate((err) => {
        if (err) {
          console.error(err);
        }
        req.session.user = username;
        console.log('successfully signed up', username);
        res.send();
      });
    })
    .catch((err) => {
      console.error('error in signup', err);
      res.status(400).send('error signing up')
    })
})

app.post('/login', (req, res) => {
  let username = req.body.username;
  let password = req.body.password;
  console.log('got login post', req.body);
  // check that username and password are valid
  // look up salt
  let hashedPassword;
  db.findUser(username)
    .then(dbRes => {
      if (dbRes.length === 0) {
        throw('user does not exist')
      }
      hashedPassword = dbRes[0].password;
      return bcrypt.hash(password, dbRes[0].salt);
    })
    .then((hashResult) => {
      //checks the entered password and compares to stored password in the database
      if (hashedPassword !== hashResult) {
        throw('wrong password')
      }
      req.session.regenerate(function(){
        req.session.user = username;
        console.log('authenticated user', username);
        res.status(200).send();
        // res.redirect('/Where');
      });
    })
    .catch(err => {
      console.error('error logging in', err);
      res.status(400).send('error logging in');
    })
})

//by destroying the sessions, it will automatically redirect to page where user's not signed in have access to
app.post('/logout', (req, res) => {
  if (req.session === undefined || req.session.user === undefined) {
    console.log('ERROR: got logout request missing session');
    res.status(400).send('ERROR: cannot log out because no user is logged in');
    return;
  }
  console.log('Got logout request from', req.session.user);
  req.session.destroy();
  res.send('Successfully logged out');
})


app.post('/date', (req, res) => {
  let cook = req.body.cook;
  let activity = req.body.activityLevel;
  let genreId = req.body.movieGenre;
  let zipCode = req.body.zipCode || 94108;
  let radius = req.body.radius || 17000;
  let minPrice = req.body.minPrice || 1;
  let maxPrice = req.body.maxPrice || 4;

  console.log(radius)
  //convert dollar signs to string price for yelp api request
  function convertPrice(minPrice, maxPrice) {
    let price = [];
     for (let i = minPrice; i <= maxPrice; i++) {
      price.push(i)
    }
    return price.join(',');
  }

  let price = convertPrice(minPrice, maxPrice)

  if (!cook) {
    if (activity === '') {
      let category = "restaurants";
      helpers.searchYelp(zipCode, radius, price, category, function(data1){
        helpers.searchMovies(genreId, function(data2){
          //return only restaurants that have delivery
          let data = [];
          JSON.parse(data1).forEach((item) => {
            if (item.transactions.indexOf('delivery') > -1) {
              data.push(item);
            }
          })
          let output = {
            restaurants: JSON.stringify(data),
            movies: data2
          }
          res.status(200).send(output);
        })
      })
    } else if (activity === "mellow") {
      let category = "restaurants";
      helpers.searchYelp(zipCode, radius, price, category, function(data){
        let output = {
          restaurants: data
        }
        res.status(200).send(output);
      })
    } else if (activity === "active") {
      let category = "arts";
      helpers.searchYelp(zipCode, radius, price, category, function(data){
        let output = {
          activities: data
        }
        res.status(200).send(output);
      })
    }
  } else {
    helpers.searchMovies(genreId, function(data){
      //hardcoded 3 examples of recipes for the user based off decision tree
      //mirrors the restaurant route
      let output = {
        movies: data,
        restaurants: JSON.stringify([
          {
            name: 'Spicy Clams Spaghetti',
            image_url: 'https://assets.marthastewart.com/styles/wmax-520-highdpi/d30/clams-spaghetti-0131-mld110647/clams-spaghetti-0131-mld110647_vert.jpg?itok=JrrPNLcs',
            price: '$'
          },
          {
            name: 'Sweet Potato, Kale, and Shrimp Skillet',
            image_url: 'http://cdn.theeverygirl.com/wp-content/uploads/2016/01/Sweet-potato-Kale-and-Shrimp-skillet-2.jpg',
            price: '$'
          },
          {
            name: 'Grilled Skirt Steak and Veggies with Guacamole',
            image_url: 'http://cdn.theeverygirl.com/wp-content/uploads/2016/01/Grilled20Skirt20Steak.jpg',
            price: '$'
          }
        ])
      }
      res.status(200).send(output);
    })
  }
})

//this portion utilizes the restrict middleware function implemented earlier
//save movies into database
app.post('/saveMovie', restrict, function(req, res) {
  console.log('req.session.user ', req.session.user)
  console.log('saving movie', req.body.movieName, req.body.moviePhoto)
  db.saveMovie(req.body.movieName, req.body.moviePhoto)
  .then(() => {
    db.saveUserMovie(req.session.user, req.body.movieName)
  })
  .then(() => {
    res.status(200).send('Saved successfully');
  })
  .catch((err) => {
    console.log(err);
    res.status(404);
  })
})

//saves activity into database
app.post('/saveActivity', restrict, function(req, res) {
  db.saveActivity(req.body.activityName, req.body.activityPhoto)
  .then(() => {
    db.saveUserActivity(req.session.user, req.body.activityName)
  })
  .then(() => {
    res.status(200).send('Saved successfully');
  })
  .catch((err) => {
    console.log(err);
    res.status(404);
  })
})

//saves restaurant into database
app.post('/saveRestaurant', restrict, function(req, res) {
  db.saveRestaurant(req.body.restaurantName, req.body.restaurantPhoto, req.body.price)
  .then(() => {
    db.saveUserRestaurant(req.session.user, req.body.restaurantName)
  })
  .then(() => {
    res.status(200).send('Saved successfully');
  })
  .catch((err) => {
    console.log(err);
    res.status(404);
  })
})

//hits all the tables within our database to retrieve saved items
app.get('/getFavorites', restrict, (req, res) => {
  db.retrieveSavedActivities(req.session.user)
  .then((data1) => {
    db.retrieveSavedRestaurants(req.session.user)
    .then((data2) => {
      db.retrieveSavedMovies(req.session.user)
      .then((data3) => {
        let output = {
          activities: data1.map(item => item[0]),
          restaurants: data2.map(item => item[0]),
          movies: data3.map(item => item[0])
        }
        res.status(200).send(output);
      })
      .catch((err) => {
        console.log('Unable to retrieve favorites', err);
      })
    })
  })
})

//removes a movie from database
app.delete('/deleteMovie', restrict, function(req, res){
  db.deleteSavedMovie(req.query.movie)
  .then(() => {
    console.log('deleted successfully');
    res.status(200).send('Deleted successfully');
  })
  .catch((err)=> {
    console.log('Unable to delete');
    res.status(404);
  })
})

//removes a restaurant from database
app.delete('/deleteRestaurant', restrict, function(req, res){
  console.log('deleting restaurant')
  db.deleteSavedRestaurant(req.query.restaurant)
  .then(() => {
    console.log('deleted restaurant');
    res.status(200).send('Deleted successfully');
  })
  .catch((err)=> {
    console.log('Unable to delete');
    res.status(404);
  })
})

//removes activity from database
app.delete('/deleteActivity', restrict, function(req, res){
  db.deleteSavedActivity(req.query.activity)
  .then(() => {
    console.log('deleted activity');
    res.status(200).send('Deleted successfully');
  })
  .catch((err)=> {
    console.log('Unable to delete');
    res.status(404);
  })
})

let port = 8080;

//redirects from any invalid endpoints back to homepage
app.get('/*', (req, res) => {
  res.sendFile(path.resolve(__dirname + '/../client/dist/index.html'));
})

app.listen(port, function() {
  console.log(`listening on port ${port}`);
});
