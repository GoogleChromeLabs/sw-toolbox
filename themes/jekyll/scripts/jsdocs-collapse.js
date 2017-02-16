/* eslint-env browser*/

/**
 * This call simply collapses the docs on the signatures of methods.
 */
class JSDocCollapse {
  /**
   * The class configures the behaviors in the constructor.
   */
  constructor() {
    const collapsingTypes = [
      'method-type-function',
      'method-type-class',
      'member-type-member',
      'member-type-typedef',
    ];
    collapsingTypes.forEach((methodClassname) => {
      const signatureElements =
        document.querySelectorAll(`.collapsing-entry.${methodClassname}`);
      signatureElements.forEach((element) => {
        if (element.querySelector('.js-collapse-details')) {
          this._configureElementBehavior(element);
        }
      });
    });
  }

  /**
   * This method will configure the show and hide behavior of the collapsing
   * sections.
   * @param {DomElement} element The element to configure to show and hide.
   */
  _configureElementBehavior(element) {
    const signatureTitle = element.querySelector('.js-collapse-title');
    const collapseElement = element.querySelector('.js-collapse-details');
    const cssClassName = 'is-closed';
    signatureTitle.addEventListener('click', (event) => {
      if (collapseElement.classList.contains(cssClassName)) {
        collapseElement.classList.remove(cssClassName);
      } else {
        collapseElement.classList.add(cssClassName);
      }
    });

    if (!element.classList.contains('start-open')) {
      collapseElement.classList.add(cssClassName);
    }
  }
}

window.__npmPublishScripts = window.__npmPublishScripts || {};
window.__npmPublishScripts.JSDocCollapse = JSDocCollapse;
