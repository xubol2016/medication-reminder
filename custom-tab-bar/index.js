Component({
  data: {
    selected: 0
  },
  methods: {
    switchTab(e) {
      const url = e.currentTarget.dataset.url
      wx.switchTab({ url })
    }
  }
})
