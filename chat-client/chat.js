import * as Vue from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'
import { mixin } from "https://mavue.mavo.io/mavue.js";
import GraffitiPlugin from 'https://graffiti.garden/graffiti-js/plugins/vue/plugin.js'
import Resolver from './resolver.js'

const app = {
  // Import MaVue
  mixins: [mixin],

  // Import resolver
  created() {
    this.resolver = new Resolver(this.$gf)
  },

  setup() {
    // start in no group or channel when page initially loaded
    const channel = Vue.ref();
    const group = Vue.ref();

    // And a flag for whether or not we're private-messaging
    // const privateMessaging = Vue.ref(false)

    // If we're private messaging use "me" as the channel,
    // otherwise use the channel value
    const $gf = Vue.inject('graffiti')
    const myGroups = Vue.computed(()=> [$gf.me])
    const channelsInGroup = Vue.computed(()=> [group.value])
    const messagesInChannel = Vue.computed(()=> [channel.value])

    // Initialize the collection of messages associated with the context
    const { objects: groupsRaw } = $gf.useObjects(myGroups)
    const { objects: channelsRaw } = $gf.useObjects(channelsInGroup)
    const { objects: messagesRaw } = $gf.useObjects(messagesInChannel)

    return { channel, group, groupsRaw, channelsRaw, messagesRaw }
  },

  data() {
    // Initialize some more reactive variables
    return {
      messageText: '',
      editID: '',
      editText: '',
      recipient: '',
      //////////////////////////////
      // Problem 1 solution
      preferredUsername: '',
      usernameResult: '',
      //////////////////////////////
      //////////////////////////////
      // Problem 2 solution
      recipientUsername: '',
      recipientUsernameSearch: '',
      //////////////////////////////
      //////////////////////////////
      // Problem 3 solution
      myUsername: '',
      actorsToUsernames: {},
      /////////////////////////////
      newMemberName: '',
      popupSelection: '',
    }
  },

  //////////////////////////////
  // Problem 3 solution
  watch: {
    '$gf.me': async function(me) {
      this.myUsername = await this.resolver.actorToUsername(me)
    },

    async messages(messages) {
      for (const m of messages) {
        if (!(m.actor in this.actorsToUsernames)) {
          this.actorsToUsernames[m.actor] = await this.resolver.actorToUsername(m.actor)
        }
        if (m.bto && m.bto.length && !(m.bto[0] in this.actorsToUsernames)) {
          this.actorsToUsernames[m.bto[0]] = await this.resolver.actorToUsername(m.bto[0])
        }
      }
      const messageList = document.getElementById('message-list');
      if (messageList) { messageList.scrollTop = messageList.scrollHeight; }
    },

    group(group) {
      this.channel = undefined;
    }
  },
  /////////////////////////////

  computed: {
    groups() {
      const allJoinedGroups = this.groupsRaw
        .filter(g => g.type === 'Member' || g.type === 'Unmember')
        .sort((g1, g2)=> new Date(g2.published) - new Date(g1.published));
      const seenGroups = new Set();
      const currentMemberGroups = [];
      for (const group of allJoinedGroups) {
        if ( ! seenGroups.has(group.groupid)) {
          seenGroups.add(group.groupid);
          if (group.type === 'Member') {
            currentMemberGroups.push(group);
          }
        }
      }
      return currentMemberGroups;
    },

    channels() {
      return this.group && this.channelsRaw
        .filter(c => c.type === 'Channel')
        .sort((g1, g2)=> new Date(g2.published) - new Date(g1.published));
    },

    messages() {
      return this.channel && this.messagesRaw
        // Filter the "raw" messages for data
        // that is appropriate for our application
        // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-note
        .filter(m=>
          // Does the message have a type property?
          m.type         &&
          // Is the value of that property 'Note'?
          m.type=='Note' &&
          // Does the message have a content property?
          (m.content || m.content == '') &&
          // Is that property a string?
          typeof m.content=='string')

        // Sort the messages with the
        // most recently created ones first
        .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
        // Only show the 10 most recent ones
        .slice(0,50)
    },

    members() {
      if ( ! this.group) return;
      const allMembersEver = this.channelsRaw // channels and members share same context
        .filter(m => m.type === 'Member' || m.type === 'Unmember')
        .sort((g1, g2)=> new Date(g2.published) - new Date(g1.published));
      const seenMembers = new Set();
      const currentMembers = [];
      for (const member of allMembersEver) {
        if ( ! seenMembers.has(member.userid)) {
          seenMembers.add(member.userid);
          if (member.type === 'Member') {
            currentMembers.push(member);
          }
        }
      }
      return currentMembers;
    },
  },

  methods: {
    async sendMessage() {
      const message = {
        type: 'Note',
        content: this.messageText,
        channelid: this.channel,
        context: [this.channel]
      }

      if (this.file) {
        message.attachment = {
          type: 'Image',
          magnet: await this.$gf.media.store(this.file)
        }
        this.file = null
      }

      // Send!
      this.$gf.post(message)
      this.messageText = ''
    },

    removeMessage(message) {
      this.$gf.remove(message)
    },

    startEditMessage(message) {
      // Mark which message we're editing
      this.editID = message.id
      // And copy over it's existing text
      this.editText = message.content
    },

    saveEditMessage(message) {
      // Save the text (which will automatically
      // sync with the server)
      message.content = this.editText
      // And clear the edit mark
      this.editID = ''
    },

    /////////////////////////////
    // Problem 1 solution
    async setUsername() {
      try {
        this.usernameResult = await this.resolver.requestUsername(this.preferredUsername)
        this.myUsername = this.preferredUsername
      } catch (e) {
        this.usernameResult = e.toString()
      }
    },
    /////////////////////////////

    /////////////////////////////
    // Problem 2 solution
    async chatWithUser() {
      this.recipient = await this.resolver.usernameToActor(this.recipientUsernameSearch)
      this.recipientUsername = this.recipientUsernameSearch
    },
    /////////////////////////////

    onImageAttachment(event) {
      const file = event.target.files[0]
      this.file = file
    },

    async addMember() {
      if ( ! this.newMemberName || ! this.group) return;
      const actorid = await this.resolver.usernameToActor(this.newMemberName);
      if ( ! actorid) return;
      this.$gf.post({
        type: 'Member',
        userid: actorid,
        groupid: this.group,
        context: [actorid, this.group]
      });
      this.newMemberName = '';
    },

    async removeMember(actorid) {
      if ( ! this.group) return;
      this.$gf.post({
        type: 'Unmember',
        userid: actorid,
        groupid: this.group,
        context: [actorid, this.group]
      });
    },

    createGroup() {
      if ( ! this.$gf.me ) return;
      const newGroupId = crypto.randomUUID();
      this.$gf.post({
        type: 'Member',
        userid: this.$gf.me,
        groupid: newGroupId,
        context: [this.$gf.me, newGroupId]
      });
      this.$gf.post({
        type: 'GroupInfo',
        name: 'New Group',
        groupid: newGroupId,
        context: [newGroupId]
      });
    },

    createChannel() {
      if ( ! this.group) return;
      const newChannelId = crypto.randomUUID();
      this.$gf.post({
        type: 'Channel',
        channelid: newChannelId,
        groupid: this.group,
        context: [this.group]
      });
      this.$gf.post({
        type: 'ChannelInfo',
        name: 'New Channel',
        date: undefined,
        channelid: newChannelId,
        context: [newChannelId]
      });
    }
  }
}

const Name = {
  props: ['actor', 'editable'],

  setup(props) {
    // Get a collection of all objects associated with the actor
    const { actor } = Vue.toRefs(props)
    const $gf = Vue.inject('graffiti')
    return $gf.useObjects([actor])
  },

  computed: {
    profile() {
      return this.objects
        // Filter the raw objects for profile data
        // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-profile
        .filter(m=>
          // Does the message have a type property?
          m.type &&
          // Is the value of that property 'Profile'?
          m.type=='Profile' &&
          // Does the message have a name property?
          m.name &&
          // Is that property a string?
          typeof m.name=='string')
        // Choose the most recent one or null if none exists
        .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
    }
  },

  data() {
    return {
      editing: false,
      editText: ''
    }
  },

  methods: {
    editName() {
      this.editing = true
      // If we already have a profile,
      // initialize the edit text to our existing name
      this.editText = this.profile? this.profile.name : this.editText
    },

    saveName() {
      if (this.profile) {
        // If we already have a profile, just change the name
        // (this will sync automatically)
        this.profile.name = this.editText
      } else {
        // Otherwise create a profile
        this.$gf.post({
          type: 'Profile',
          name: this.editText
        })
      }

      // Exit the editing state
      this.editing = false
    }
  },

  template: '#name'
}

const Like = {
  props: ["messageid"],

  setup(props) {
    const $gf = Vue.inject('graffiti')
    const messageid = Vue.toRef(props, 'messageid')
    const { objects: likesRaw } = $gf.useObjects([messageid])
    return { likesRaw }
  },

  computed: {
    likes() {
      return this.likesRaw.filter(l=>
        l.type == 'Like' &&
        l.object == this.messageid)
    },

    numLikes() {
      // Unique number of actors
      return [...new Set(this.likes.map(l=>l.actor))].length
    },

    myLikes() {
      return this.likes.filter(l=> l.actor == this.$gf.me)
    }
  },

  methods: {
    toggleLike() {
      if (this.myLikes.length) {
        this.$gf.remove(...this.myLikes)
      } else {
        this.$gf.post({
          type: 'Like',
          object: this.messageid,
          context: [this.messageid]
        })
      }
    }
  },

  template: '#like'
}

const MagnetImg = {
  props: {
    src: String,
    loading: {
      type: String,
      default: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Loading_icon_cropped.gif'
    },
    error: {
      type: String,
      default: '' // empty string will trigger broken link
    }
  },

  data() {
    return {
      fetchedSrc: ''
    }
  },

  watch: {
    src: {
      async handler(src) {
        this.fetchedSrc = this.loading
        try {
          this.fetchedSrc = await this.$gf.media.fetchURL(src)
        } catch {
          this.fetchedSrc = this.error
        }
      },
      immediate: true
    }
  },

  template: '<img :src="fetchedSrc" class="image"/>'
}

const ProfilePicture = {
  props: {
    actor: {
      type: String
    },
    editable: {
      type: Boolean,
      default: false
    },
    anonymous: {
      type: String,
      default: 'magnet:?xt=urn:btih:58c03e56171ecbe97f865ae9327c79ab3c1d5f16&dn=Anonymous.svg&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
    }
  },

  setup(props) {
    // Get a collection of all objects associated with the actor
    const { actor } = Vue.toRefs(props)
    const $gf = Vue.inject('graffiti')
    return $gf.useObjects([actor])
  },

  computed: {
    profile() {
      return this.objects
        .filter(m=>
          m.type=='Profile' &&
          m.icon &&
          m.icon.type == 'Image' &&
          typeof m.icon.magnet == 'string')
        .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
    }
  },

  data() {
    return {
      file: null
    }
  },

  methods: {
    async savePicture() {
      if (!this.file) return

      this.$gf.post({
        type: 'Profile',
        icon: {
          type: 'Image',
          magnet: await this.$gf.media.store(this.file)
        }
      })
    },

    onPicture(event) {
      const file = event.target.files[0]
      this.file = file
    }
  },

  template: '#profile-picture'
}

const Replies = {
  props: ["messageid"],

  setup(props) {
    const $gf = Vue.inject('graffiti')
    const messageid = Vue.toRef(props, 'messageid')
    return $gf.useObjects([messageid])
  },

  computed: {
    replies() {
      return this.objects.filter(o=>
        o.type == 'Note' &&
        typeof o.content == 'string' &&
        o.inReplyTo == this.messageid)
      .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
    },
  },

  data() {
    return {
      content: ''
    }
  },

  methods: {
    postReply() {
      if (!this.content) return

      this.$gf.post({
        type: 'Note',
        content: this.content,
        inReplyTo: this.messageid,
        context: [this.messageid]
      })
      this.content = ''
    }
  },

  template: '#replies'
}

const ReadReceipts = {
  props: ["messageid"],

  setup(props) {
    const $gf = Vue.inject('graffiti')
    const messageid = Vue.toRef(props, 'messageid')
    return $gf.useObjects([messageid])
  },

  async mounted() {
    if (!(this.readActors.includes(this.$gf.me))) {
      this.$gf.post({
        type: 'Read',
        object: this.messageid,
        context: [this.messageid]
      })
    }
  },

  computed: {
    reads() {
      return this.objects.filter(o=>
        o.type == 'Read' &&
        o.object == this.messageid)
    },

    myReads() {
      return this.reads.filter(r=>r.actor==this.$gf.me)
    },

    readActors() {
      return [...new Set(this.reads.map(r=>r.actor))]
    }
  },

  watch: {
    // In case we accidentally "read" more than once.
    myReads(myReads) {
      if (myReads.length > 1) {
        // Remove all but one
        this.$gf.remove(...myReads.slice(1))
      }
    }
  },

  template: '#read-receipts'
}

const Group = {
  props: ['groupid', 'editable'],

  setup(props) {
    const $gf = Vue.inject('graffiti')
    const groupid = Vue.toRef(props, 'groupid')
    return $gf.useObjects([groupid])
  },

  computed: {
    name() {
      return this.objects
        .filter(g => g.type === 'GroupInfo' && g.groupid === this.groupid)
        .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
        .at(0)?.name;
    }
  },

  data() {
    return {
      newName: '',
      editing: false,
    }
  },

  methods: {
    edit() {
      this.newName = this.name;
      this.editing = true;
    },

    rename() {
      if ( ! this.newName) { return; }
      this.$gf.post({
        type: 'GroupInfo',
        name: this.newName,
        groupid: this.groupid,
        context: [this.groupid]
      });
      this.editing = false;
    }
  },

  template: '#group'
}

const Channel = {
  props: ['channelid', 'editable'],

  setup(props) {
    const $gf = Vue.inject('graffiti')
    const channelid = Vue.toRef(props, 'channelid')
    return $gf.useObjects([channelid])
  },

  computed: {
    name() {
      return this.objects
        .filter(g => g.type === 'ChannelInfo' && g.channelid === this.channelid)
        .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
        .at(0)?.name;
    },

    date() {
      return this.objects
        .filter(g => g.type === 'ChannelInfo' && g.channelid === this.channelid)
        .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
        .at(0)?.date;
    }
  },

  data() {
    return {
      newName: '',
      newDate: undefined,
      editing: false,
    }
  },

  methods: {
    edit() {
      this.newName = this.name;
      this.newDate = this.date;
      this.editing = true;
    },

    rename() {
      if ( ! this.newName) { return; }
      this.$gf.post({
        type: 'ChannelInfo',
        name: this.newName,
        date: this.newDate,
        channelid: this.channelid,
        context: [this.channelid]
      });
      this.editing = false;
    }
  },

  template: '#channel'
}

Vue.createApp(app)
   .component('name', Name)
   .component('like', Like)
   .component('magnet-img', MagnetImg)
   .component('profile-picture', ProfilePicture)
   .component('replies', Replies)
   .component('read-receipts', ReadReceipts)
   .component('group', Group)
   .component('channel', Channel)
   .use(GraffitiPlugin(Vue))
   .mount('#app')