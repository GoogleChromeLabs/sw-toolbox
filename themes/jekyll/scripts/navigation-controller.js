/* eslint-env browser */

/**
 * This class handles logic for opening and closing the navigation drawer
 */
class NavigationController {
  /**
   * This method sets up the navigation for the site and throws an error is
   * anything can't be completed.
   */
  constructor() {
    this._navDrawer = new window.__npmPublishScripts.NavDrawer();
    this._jsdocCollapse = new window.__npmPublishScripts.JSDocCollapse();

    this._configureMenuBtn();
  }

  /**
   * This sets up the menu btn to open / close the nav drawer.
   */
  _configureMenuBtn() {
    const menuBtn = document.querySelector('.js-menu-btn');
    if(!menuBtn) {
      throw new Error('Unable to find js-menu-btn.');
    }

    menuBtn.addEventListener('click', () => {
      this.toggleNavDrawer();
    });
  }

  /**
   * This toggles the nav drawer open and closed
   */
  toggleNavDrawer() {
    this._navDrawer.toggle();
  }
}

window.addEventListener('load', function() {
  if (!window.__npmPublishScripts || !window.__npmPublishScripts.NavDrawer) {
    throw new Error('self.__npmPublishScripts.NavDrawer is not defined.');
  }

  window.__npmPublishScripts = window.__npmPublishScripts || {};
  window.__npmPublishScripts.navController = new NavigationController();
});
