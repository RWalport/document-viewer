DV.view.PageSet = DV.Backbone.View.extend({
  initialize: function(options) {
    // From PageSet
    this.viewer          = options.viewer;
    this.currentPage = null;
    this.pages       = {};
  },
  
  // taken from helpers/helpers.js#constructPages
  // Sets up three page objects.
  render: function() {
    var pages = [];
    var totalPagesToCreate = (this.viewer.model.get('totalPages') < 3) ? this.viewer.model.get('totalPages') : 3;

    for (var i = 0; i < totalPagesToCreate; i++) {
      pages.push(JST['pages']({ pageNumber: i+1, pageIndex: i , pageImageSource: null, baseHeight: this.height }));
    }

    return pages.join('');
  },

  /*
    ALL OF THE METHODS BELOW WERE EXTRACTED FROM PAGE SET
  */
  
  // used to call the same method with the same params against all page instances
  execute: function(action,params){
    this.pages.each(function(pageInstance){ pageInstance[action].apply(pageInstance,params); });
  },

  // build the basic page presentation layer
  buildPages: function(options) {
    this.zoomText();
    options = options || {};
    var pages = this.getPages();

    _.each(pages, function(page){
      page.set  = this;
      // TODO: Make more explicit, this is sloppy
      this.pages[page.label] = new DV.Page(this.viewer, page);
      if (page.currentPage == true) { this.currentPage = this.pages[page.label]; }
    }, this);

    this.viewer.models.annotations.renderAnnotations();
  },

  // used to generate references for the build action
  getPages: function(){
    var _pages = [];
    // for each of the Page DOM nodes
    this.viewer.elements.sets.each(function(_index,el){
      // identify whether this page is the current page
      var currentPage = (_index == 0) ? true : false;
      // create an impromptu model
      _pages.push({ 
        label: 'p'+_index, 
        el: el, 
        index: _index, 
        pageNumber: _index+1, 
        currentPage: currentPage 
      });
    });
    return _pages; // and return all of the models.
  },

  // basic reflow to ensure zoomlevel is right, pages are in the right place and annotation limits are correct
  reflowPages: function() {
    this.viewer.models.pages.resize();
    this.viewer.helpers.setActiveAnnotationLimits();
    this.redraw(false, true);
  },

  // reflow the pages without causing the container to resize or annotations to redraw
  simpleReflowPages: function(){
    this.viewer.helpers.setActiveAnnotationLimits();
    this.redraw(false, false);
  },

  // hide any active annotations
  cleanUp: function(){ if(this.viewer.activeAnnotation){ this.viewer.activeAnnotation.hide(true); } },

  zoom: function(argHash){
    if (this.viewer.models.document.zoomLevel === argHash.zoomLevel) return;

    var currentPage  = this.viewer.models.document.currentIndex();
    var oldOffset    = this.viewer.models.document.offsets[currentPage];
    var oldZoom      = this.viewer.models.document.zoomLevel*1;
    var relativeZoom = argHash.zoomLevel / oldZoom;
    var scrollPos    = this.viewer.elements.window.scrollTop();

    this.viewer.models.document.zoom(argHash.zoomLevel);

    // absolute value of the difference between oldOffset and scrollPos.
    var diff = oldOffset - scrollPos;
    if (diff < 0) diff *= -1

    var diffPercentage   = diff / this.viewer.models.pages.height;

    this.reflowPages();
    this.zoomText();

    if (this.viewer.state === 'ViewThumbnails') {
      this.viewer.thumbnails.setZoom(argHash.zoomLevel);
      this.viewer.thumbnails.lazyloadThumbnails();
    }

    // Zoom any drawn redactions.
    if (this.viewer.state === 'ViewDocument') {
      this.viewer.$('.DV-annotationRegion.DV-accessRedact').each(function() {
        var el = DV.jQuery(this);
        el.css({
          top    : Math.round(el.position().top  * relativeZoom),
          left   : Math.round(el.position().left * relativeZoom),
          width  : Math.round(el.width()         * relativeZoom),
          height : Math.round(el.height()        * relativeZoom)
        });
      });
    }

    if(this.viewer.activeAnnotation != null){
      // FIXME:

      var args = {
        index: this.viewer.models.document.currentIndex(),
        top: this.viewer.activeAnnotation.top,
        id: this.viewer.activeAnnotation.id
      };
      this.viewer.activeAnnotation = null;

      this.showAnnotation(args);
      this.viewer.helpers.setActiveAnnotationLimits(this.viewer.activeAnnotation);
    }else{
      var _offset      = Math.round(this.viewer.models.pages.height * diffPercentage);
      this.viewer.helpers.jump(this.viewer.models.document.currentIndex(),_offset);
    }
  },

  // Zoom the text container.
  zoomText: function() {
    var padding = this.viewer.models.pages.getPadding();
    var width   = this.viewer.models.pages.zoomLevel;
    this.viewer.$('.DV-textContents').width(width - padding);
    this.viewer.$('.DV-textPage').width(width);
    this.viewer.elements.collection.css({'width' : width + padding});
  },

  // draw the pages
  draw: function(pageCollection){
    for(var i = 0, pageCollectionLength = pageCollection.length; i < pageCollectionLength;i++){
      var page = this.pages[pageCollection[i].label];
      if (page) page.draw({ index: pageCollection[i].index, pageNumber: pageCollection[i].index+1});
    }
  },

  redraw: function(stopResetOfPosition, redrawAnnotations) {
    if (this.pages['p0']) this.pages['p0'].draw({ force: true, forceAnnotationRedraw : redrawAnnotations });
    if (this.pages['p1']) this.pages['p1'].draw({ force: true, forceAnnotationRedraw : redrawAnnotations });
    if (this.pages['p2']) this.pages['p2'].draw({ force: true, forceAnnotationRedraw : redrawAnnotations });

    if(redrawAnnotations && this.viewer.activeAnnotation){
      this.viewer.helpers.jump(this.viewer.activeAnnotation.page.index,this.viewer.activeAnnotation.position.top - 37);
    }
  },

  // set the annotation to load ahead of time
  setActiveAnnotation: function(annotationId, edit){
    this.viewer.annotationToLoadId   = annotationId;
    this.viewer.annotationToLoadEdit = edit ? annotationId : null;
  },

  // a funky fucking mess to jump to the annotation that is active
  showAnnotation: function(argHash, showHash){
    showHash = showHash || {};

    // if state is ViewAnnotation, jump to the appropriate position in the view
    // else
    // hide active annotations and locate the position of the next annotation
    // NOTE: This needs work
    if(this.viewer.state === 'ViewAnnotation'){

      var offset = this.viewer.$('.DV-allAnnotations div[rel=aid-'+argHash.id+']')[0].offsetTop;
      this.viewer.elements.window.scrollTop(offset+10,'fast');
      this.viewer.helpers.setActiveAnnotationInNav(argHash.id);
      this.viewer.activeAnnotationId = argHash.id;
      // this.viewer.history.save('annotation/a'+argHash.id);
      return;
    }else{
      this.viewer.helpers.removeObserver('trackAnnotation');
      this.viewer.activeAnnotationId = null;
      if(this.viewer.activeAnnotation != null){
        this.viewer.activeAnnotation.hide();
      }
      this.setActiveAnnotation(argHash.id, showHash.edit);

      var isPage = this.viewer.models.annotations.byId[argHash.id].type == 'page';
      var nudge  = isPage ? -7 : 36;
      var offset = argHash.top - nudge;

      for(var i = 0; i <= 2; i++){
        if (this.pages['p' + i]) {
          for(var n = 0; n < this.pages['p'+i].annotations.length; n++){
            if(this.pages['p'+i].annotations[n].id === argHash.id){
              this.viewer.helpers.jump(argHash.index, offset);
              this.pages['p'+i].annotations[n].show(showHash);
              return;
            }
          }
        }
      }

      this.viewer.helpers.jump(argHash.index,offset);
    }
  }
  

});
