﻿var selectedTags = [];
var delicious = chrome.extension.getBackgroundPage().delicious;
var notifications;
var postList = null;
var tagList = null;
var postElementCache = {};
var tagElementCache = {};

document.addEvent('domready', function(){
	//initialize
	postList = new PostList('posts', {
		localStorageID: 'posts',
		sortOrder: 'desc',
		sorters: {
			'name': sortPostByTitle,
			'date': sortPostByTime
		},
		currentSorter: 'date',
		data: delicious.posts
	}).update();
	
	tagList = new TagList('tags',{
		localStorageID: 'tags',
		sortOrder: 'desc',
		sorters: {
			'name': sortTagByName,
			'count': sortTagByCount
		},
		currentSorter: 'count',
		data: delicious.tags
	}).update();
	
	notifications = new Notifications('notifications');
	
	$('breadcrumbs').empty();
	
	$('search').addEventListener('keyup', function(){
		postList.filter(this.get('value'));
		tagList.filter(this.get('value'));
	});
	$('search').focus();
	
	$('search').addEvent('change', function(){
		if($('search').value){
			$('cancelsearch').addClass('visible');
		}else{
			$('cancelsearch').removeClass('visible');
		}
	});
	
	$('tags_title').addEventListener('click', function(){
		clearTags();
		$('search').focus();
	});
	
	$('tag').addEventListener('click', function(){
		chrome.tabs.getSelected(null, function (tab){
			var tabUrl = tab.url;
			var tabTitle = tab.title;
			
			bookmarkURL(tabUrl, tabTitle);
		});
	});
	chrome.tabs.getSelected(null, function(tab){
		var url = tab.url;
		var active = delicious.posts.some(function(item){
			return item.url == tab.url;
		});
		
		if(active){
			$('tag').addClass('active').set('title', 'edit this bookmark');
		}else{
			$('tag').set('title', 'bookmark this page');
		}
	});
	
	new SortMenu('post_sort', postList);
	new SortMenu('tag_sort', tagList);
	
	chrome.extension.onRequest.addListener(function(request){
		if(request == 'updated'){
			notifications.add('Your bookmarks have been updated');
		}else if(request == 'error'){
			//notifications.add('Bookmark update failed', 'error');
		}else if(request == 'noupdate'){
			//notifications.add('Bookmarks still fresh');
		}
	});
	
	if(!delicious.username && !delicious.password){
		notifications.add('Set your user data in the <a href="javascript:chrome.tabs.create({url: \'options.html\'});">options page</a>');
	}else{
		delicious.update();
	}
});

function bookmarkURL(url, title){
	if(title){
		var f = 'http://delicious.com/save?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title);
	}else{
		var f = 'http://delicious.com/save?url=' + encodeURIComponent(url);
	}
	
	window.open(f + '&v=5&noui=1&jump=doclose', 'deliciousuiv5', 'location=yes,links=no,scrollbars=no,toolbar=no,width=550,height=550');
}

/*returns true if array contains every item in items*/
function ArrayContainsEvery(array, items){
	return items.every(function(item){
		return array.contains(item);
	});
}

/*notification helper*/
var Notifications = new Class({
	initialize: function(el){
		this.element = $(el).empty();
	},
	
	add: function(text, type){
		var li = new Element('li', {'html': text}).addClass(type).injectInside(this.element);
		var close = new Element('a', {'text': 'close', href: '#'}).addClass('close').injectInside(li);
		close.addEventListener('click', function(){
			li.dispose();
		});
	}
});

/*populates the sort menu inside el with menu items for each sorter of the given list*/
var SortMenu = new Class({
	initialize: function(el, list){
		this.element = $(el);
		this.list = list;
		this.update();
	},
	
	update: function(){
		var element = this.element;
		var list = this.list;
		var listElement = element.getElement('ul').empty();
		var sortButtons = new Elements();
		var viewButtons = new Elements();
		var sortDirectionButton = element.getElement('a.sort').addClass(list.sortOrder);
		
		//create sorter buttons
		$each(list.sorters, function(item, key){
			var li = new Element('li').injectInside(listElement);
			var anchor = new Element('a', {text: 'sort by ' + key, href: '#'}).injectInside(li);
			anchor.addEventListener('click', function(){
				list.sort(key).update();
				sortButtons.removeClass('active');
				li.addClass('active');
			});
			
			if(list.currentSorter == key)
				li.addClass('active');
			
			sortButtons.push(li);
		}, this);
		
		//create sorte direction button
		sortDirectionButton.addEventListener('click', function(){
			this.removeClass(list.sortOrder);
			list.toggleSortOrder().update();
			this.addClass(list.sortOrder);
		});
		
		//create view buttons
		if(list.views.length > 1){
			listElement.appendChild(new Element('hr'));
			$each(list.views, function(item){
				var li = new Element('li').injectInside(listElement);
				var anchor = new Element('a', {text: 'view as ' + item, href: '#'}).injectInside(li);
				anchor.addEventListener('click', function(){
					list.setView(item);
					viewButtons.removeClass('active');
					li.addClass('active');
				});
				
				if(list.currentView == item)
					li.addClass('active');
				
				viewButtons.push(li);
			}, this);
		}
			
		return this;
	}
});

/**/
function filterPosts(filterTags){
	var index = {};
	var tags = [];
	var posts = delicious.posts;
	var post;
	var tag;
	
	if(filterTags.length){
		posts = delicious.posts.filter(function(item){
			return !filterTags.length || ArrayContainsEvery(item.tags, filterTags);
		});
	}
	
	for(var i = posts.length - 1; i >= 0; i--){
		post = posts[i];
		for(var i2 = post.tags.length - 1; i2 >= 0; i2--){
			tag = post.tags[i2];
			index[tag] = (index[tag] || 0) + 1;
		}
	}
	
	filterTags.each(function(item){
		delete index[item];
	});
	
	$each(index, function(item, key){
		tags.push({name: key, count: item});
	});
	
	postList.setData(posts).update();
	tagList.setData(tags).update();
}

/**/
function updateBreadcrumbs(){
	listElement = $('breadcrumbs').empty();
	
	selectedTags.each(function(item){
		var li = new Element('li');
		var anchor = new Element('a', {text: item, href: '#'});
		
		anchor.injectInside(li);
		li.injectInside(listElement);
		
		anchor.addEventListener('click', function(){
			li.getAllNext().get('text').each(function(item){
				selectedTags.erase(item);
			});
			updateBreadcrumbs();
		});
	});
	
	filterPosts(selectedTags);
}

/*Tag Selection*/
function clearTags(){
	$('search').set('value', '');
	selectedTags = [];
	updateBreadcrumbs();
}
function selectTag(tag){
	$('search').set('value', '');
	selectedTags.push(tag);
	updateBreadcrumbs();
}
function removeTag(tag){
	$('search').set('value', '');
	selectedTags.erase(tag);
	updateBreadcrumbs();
}

/*Sorters*/
function sortPostByTitle(a, b){
	a = a.title.toLowerCase();
	b = b.title.toLowerCase();
	if(a == b){
		return 0;
	}else if(a < b){
		return -1;
	}else{
		return 1;
	}
}

function sortPostByTime(a, b){
	a = a.time.toLowerCase();
	b = b.time.toLowerCase();
	if(a == b){
		return 0;
	}else if(a < b){
		return -1;
	}else{
		return 1;
	}
}

function sortTagByName(a, b){
	a = a.name.toLowerCase();
	b = b.name.toLowerCase();
	if(a == b){
		return 0;
	}else if(a < b){
		return -1;
	}else{
		return 1;
	}
}

function sortTagByCount(a, b){
	if(a.count == b.count){
		return sortTagByName(b, a);
	}else{
		return a.count - b.count;
	}
}