const functions = require('firebase-functions');
const app = require('express')();
const FBAuth = require('./utility/fbAuth');

const cors = require('cors');
app.use(cors());

const { db } = require('./utility/admin');

const {
  getAllShouts,
  postOneShout,
  getShout,
  commentOnShout,
  likeShout,
  unlikeShout,
  deleteShout
} = require('./handlers/shouts');
const {
  signup,
  login,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  getUserDetails,
  markNotificationsRead
} = require('./handlers/users');

// Shout routes
app.get('/shouts', getAllShouts);
app.post('/shout', FBAuth, postOneShout);
app.get('/shout/:shoutID', getShout);
app.post('/shout/:shoutID/comment', FBAuth, commentOnShout);
app.get('/shout/:shoutID/like', FBAuth, likeShout);
app.get('/shout/:shoutID/unlike', FBAuth, unlikeShout);
app.delete('/shout/:shoutID', FBAuth, deleteShout);

// users routes
app.post('/signup', signup);
app.post('/login', login);
app.post('/user/image', FBAuth, uploadImage);
app.post('/user', FBAuth, addUserDetails);
app.get('/user', FBAuth, getAuthenticatedUser);
app.get('/user/:handle', getUserDetails);
app.post('/notifications', FBAuth, markNotificationsRead);

exports.api = functions.region('europe-west1').https.onRequest(app);

exports.createNotificationOnLike = functions
  .region('europe-west1')
  .firestore.document('likes/{id}')
  .onCreate((snapshot) => {
    return db
      .doc(`/shouts/${snapshot.data().shoutId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'like',
            read: false,
            shoutId: doc.id
          });
        }
      })
      .catch((err) => console.error(err));
  });
exports.deleteNotificationOnUnLike = functions
  .region('europe-west1')
  .firestore.document('likes/{id}')
  .onDelete((snapshot) => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch((err) => {
        console.error(err);
        return;
      });
  });
exports.createNotificationOnComment = functions
  .region('europe-west1')
  .firestore.document('comments/{id}')
  .onCreate((snapshot) => {
    return db
      .doc(`/shouts/${snapshot.data().shoutId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'comment',
            read: false,
            shoutId: doc.id
          });
        }
      })
      .catch((err) => {
        console.error(err);
        return;
      });
  });

exports.onUserImageChange = functions
  .region('europe-west1')
  .firestore.document('/users/{userId}')
  .onUpdate((change) => {
    console.log(change.before.data());
    console.log(change.after.data());
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      console.log('image has changed');
      const batch = db.batch();
      return db
        .collection('shouts')
        .where('userHandle', '==', change.before.data().handle)
        .get()
        .then((data) => {
          data.forEach((doc) => {
            const shout = db.doc(`/shouts/${doc.id}`);
            batch.update(shout, { userImage: change.after.data().imageUrl });
          });
          return batch.commit();
        });
    } else return true;
  });

exports.onShoutDelete = functions
  .region('europe-west1')
  .firestore.document('/shouts/{shoutId}')
  .onDelete((snapshot, context) => {
    const shoutId = context.params.shoutId;
    const batch = db.batch();
    return db
      .collection('comments')
      .where('shoutId', '==', shoutId)
      .get()
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db
          .collection('likes')
          .where('shoutId', '==', shoutId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection('notifications')
          .where('shoutId', '==', shoutId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch((err) => console.error(err));
  });