
var AUTHENTICATION_MESSAGE = 'Request did not have an authenticated user attached with it';
// do not chage the order of these role names, may ad to the end of array 
var GENERIC_ROLE_NAMES = ['super','tenant','admin','client','employee','customer'];


var addTenant = function(request) {
  return new Promise((resolve, reject) => {
    addUser(request).then((user)=>{
      
      var Tenant = Parse.Object.extend("Tenant");
      var tenant = new Tenant();
      tenant.set("user", user);
      tenant.set("companyName", request.params.companyName);
      tenant.set("status", request.params.companyStatus? 'active' : 'unverified');
      tenant.save(null, { useMasterKey: true }).then(
        function(tenant) {
          updateTenantCompanyLogoPic(tenant, request).then((tenant)=>{
            generateRolesForNewTenant(user,tenant).then((tenantRoles)=>{
              getAllGenericRoles().then((genericRoles)=>{
                setPermissionsForNewTenant(user, tenant, tenantRoles, genericRoles).then((tenant)=>{
                  resolve(tenant);
                }).catch((error)=>{
                  reject(error);
                })//setPermissionsForNewTenant
              }).catch((error)=>{
                reject(error);
              })//getAllGenericRoles            
            }).catch((error)=>{
              reject(error);
            })//generateRolesForNewTenant
          }).catch((error)=>{
            reject(error);
          })//updateTenantCompanyLogoPic
        },
        function(tenant, error) {
          reject(error)
        }
      );
    }).catch((error)=>{
      reject(error);
    });
  });
}

var setPermissionsForNewTenant = function(user, tenant, tenantRoles, genericRoles){
  return new Promise((resolve, reject) => {
    // add super users permissions
    addRoleToRoles(genericRoles[0],tenantRoles).then((tenantRoles)=>{
      // Set New Tenant ACLs
      setNewTenantACL(user, tenant, tenantRoles, genericRoles).then((tenant)=>{
        resolve(tenant);
      }).catch((error)=>{
        reject(error)
      })
    }).catch((error)=>{
      reject(error)
    })
  });
}

var setNewTenantACL = function(user, tenant, tenantRoles, genericRoles){
  return new Promise((resolve, reject) => {

    var acl = new Parse.ACL();    
    acl.setRoleWriteAccess( user.id+'_admin', true);
    acl.setRoleReadAccess( user.id+'_admin', true);
    acl.setRoleWriteAccess('super', true);
    acl.setRoleReadAccess('super', true);
    acl.setRoleReadAccess(user.id, true);
    tenant.setACL(acl);
    user.setACL(acl);

    // add user to generic tenant role
    var genericTenantRole = genericRoles[1];
    var genericAdminRole = genericRoles[2];

    genericTenantRole.getUsers().add(user);
    genericAdminRole.getUsers().add(user);

    saveAll([tenant,user,genericTenantRole,genericAdminRole]).then((parseObjs)=>{
      resolve(parseObjs[0]);
    }).catch((error)=>{
      reject(error);
    });
  });
}

var saveAll = function(parseObjs){
  return new Promise((resolve, reject) => {
    var sequence = [];
    for(var i=0; i<parseObjs.length; i++){
      sequence.push(save(parseObjs[i]));
    }    
    Promise.all(sequence).then(values => {
      resolve(values);
    });
  });
}

// parseObj: Parse.Object
// roles: Parse.Role[]
var addRolesReadAccessToACL = function(parseObj ,roles){
  return new Promise((resolve, reject) => {
    var sequence = [];
    
    var acl = parseObj.getACL();
    for(var i=0; i<roles.length; i++){
      acl.setRoleReadAccess(roles[i], true);
      parseObj.setACL(acl);
      sequence.push(save(parseObj));
    }    
    Promise.all(sequence).then(values => {
      resolve(values);
    });
  });
}

// parseObj: Parse.Object
// roles: Parse.Role[]
var addRolesWriteAccessToACL = function(parseObj ,roles){
  return new Promise((resolve, reject) => {
    var acl = parseObj.getACL();
    for(var i=0; i<roles.length; i++){
      acl.setRoleWriteAccess(roles[i], true);
    }
    save(parseObj).then((parseObj)=>{
      resolve(parseObj);
    }).catch((error)=>{
      reject(error);
    })
  });
}

// child inherits all parents permissions
// child: Parse.Role
// parents: Parse.Role[]
var addRoleToRoles = function(child ,parents){
  return new Promise((resolve, reject) => {
    var sequence = [];
    for(var i=0; i<parents.length; i++){
      parents[i].getRoles().add(child);
      sequence.push(save(parents[i]));
    }
    Promise.all(sequence).then(values => {
      resolve(values);
    });
  });
}

var save = function(parseObject){
  return new Promise((resolve, reject) => {
    parseObject.save(null, { useMasterKey: true }).then(
      function(parseObject) {
        resolve(parseObject);
      },
      function(parseObject, error) {
        reject(error);
      }
    );
  });
}

var getRole = function(roleName){
  return new Promise((resolve, reject) => {
    var query = new Parse.Query('_Role');
    query.equalTo("name", roleName);
    query.find({ useMasterKey: true }).then(
      function(role) {
        resolve(role[0]);
      },
      function(role, error) {
        reject(error);
      }
    );
  });
}

var getAllGenericRoles = function() {
  return new Promise((resolve, reject) => {    
    var sequence = [];
    for(var i=0; i<GENERIC_ROLE_NAMES.length; i++){
      sequence.push(getRole(GENERIC_ROLE_NAMES[i]));
    }
    Promise.all(sequence).then(values => {
      resolve(values);
    });
  });
}

var generateRolesForNewTenant = function(user, tenant){
  return new Promise((resolve, reject) => {    
    var sequence = [];
    for(var i=1; i<GENERIC_ROLE_NAMES.length; i++){
      sequence.push(createRole( user, user.id+'_'+GENERIC_ROLE_NAMES[i]));
    }
    Promise.all(sequence).then(values => {
      resolve(values);
    }).catch((error)=>{
      reject(error);
    });
  });
}

var addUserToTenantsRole = function(user){
  return new Promise((resolve, reject) => {
    getRole('tenant').then(
    function(tenantRole){
      tenantRole.getUsers().add(user);
      tenantRole.save(null, { useMasterKey: true }).then(
        function(tenantRole) {
          resolve(tenantRole);
        },
        function(tenantRole, error) {
          reject(error);
        }
      );
    },function(tenantRole, error){
      reject(error);
    });
  });
}

var createRole = function(user, name){
  return new Promise((resolve, reject) => {
    var role_acl = new Parse.ACL();
    role_acl.setRoleReadAccess( 'super', true);
    role_acl.setRoleWriteAccess( 'super', true);
    if(name.includes('tenant')){name = user.id;}
    var role = new Parse.Role(name, role_acl);
    save(role).then((role)=>{
      role_acl.setRoleReadAccess( user.id, true);
      role_acl.setRoleWriteAccess( user.id, true);
      role.setACL(role_acl);
      save(role).then((role)=>{
        resolve(role);        
      }).catch((error)=>{
        reject(error);
      })
    }).catch((error)=>{
      reject(error);
    })
  })
}

var updateTenantCompanyLogoPic = function(tenant, request){
  return new Promise((resolve, reject) => {
    if(request.params.companyLogoPic.length){
      tenant.set("logo", getParseFile(tenant.id + "_companyLogoPic",{ base64: request.params.companyLogoPic }));
      tenant.save(null, { useMasterKey: true }).then(
        function(tenant) {
          resolve(tenant);
        },
        function(tenant, error) {
          reject(error);
        }
      );
    }else{
      reject({message: "ERROR : Image upload failed, data lenght 0."});
    }
  });
}

var setUserProfilePic = function(user, request){
  return new Promise((resolve, reject) => {
    console.log("profile pic : ");
    console.log(JSON.stringify(request.params.profilePic));
    if(request.params.profilePic && request.params.profilePic.length){
      user.set("profilePic", getParseFile(user.id + "_profilePic",{ base64: request.params.profilePic }));
      user.save(null, { useMasterKey: true }).then(
        function(user) {
          resolve(user);
        },
        function(user, error) {
          reject(error);
        }
      );
    }else{
      console.error({message: "ERROR : Image upload failed, data lenght 0."});
      resolve(user);
    }
  });
}

var addSuperACLPermissions = function(parseObj){
  var parseObj_acl = new Parse.ACL();
  parseObj_acl.setRoleWriteAccess('super', true);
  parseObj_acl.setRoleReadAccess('super', true);
  parseObj.setACL(parseObj_acl);
  return parseObj;
}

var addUser = function(request){
  return new Promise((resolve, reject) => {
    var user = new Parse.User();
    user.set("username", request.params.username);
    user.set("password", request.params.password);
    user.set("firstName", request.params.firstName);
    user.set("lastName", request.params.lastName);
    user.set("email", request.params.email);

    user.signUp(null, { useMasterKey: true }).then(function(user) {  
      setUserProfilePic(user,request).then((user)=>{
        resolve(user)
      }).catch((error)=>{
        reject(error)
      })
    },function(user, error) {
      reject(error)
    }
    )
  })
}

var getParseFile = function(name, encoding){
  name = name.replace(/[^a-zA-Z0-9_.]/g, '');
  var parseFile = new Parse.File( name, encoding);
  return parseFile;
}

Parse.Cloud.define('newClient', function(request, response){
  var divider = "\n\n++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++\n";
  console.log(divider);
  var query = new Parse.Query("Tenant");
  query.find({ sessionToken: request.user.getSessionToken() }).then(function(tenant) {
    console.log("tenant : "  + tenant.length);
    addUser(request).then((clientUser)=>{
      console.log("created new user for client : " + clientUser.id);
      
      var Client = Parse.Object.extend("Client");
      var client = new Client();
      
      client.set('name',request.params.name);
      client.set('addressString',request.params.addressString);
      client.set('email',request.params.email);
      client.set('phone',request.params.phone);
      save(client).then((client)=>{
        console.log("tenant id : "+tenant.id);
        setNewClientACLRolesAndPermissions(clientUser,client,tenant).then((client)=>{
          response.success(client);
        }).catch((error)=>{
          response.error(error);
        });
      }).catch((error)=>{
        response.error(error);
      });      
    }).catch((error)=>{
      response.error(error);
    });
  }, function(error) {
    response.error(error);
  });
});

var setNewClientACLRolesAndPermissions = function(user, client, tenant){
  console.log("setNewClientACLRolesAndPermissions ..............");
  
  return new Promise((resolve, reject) => {
    var acl = new Parse.ACL();
    // Roles
    console.log(tenant.id);
    acl.setRoleReadAccess(tenant.id, true);

    console.log(tenant.id+'_admin');
    acl.setRoleWriteAccess( tenant.id+'_admin', true);
    acl.setRoleReadAccess( tenant.id+'_admin', true);

    console.log('super');
    acl.setRoleWriteAccess('super', true);
    acl.setRoleReadAccess('super', true);

    // Users 
    console.log(tenant.id);
    acl.setReadAccess( tenant.id, true);
    acl.setWriteAccess( tenant.id, true);
    
    console.log(user.id);
    acl.setReadAccess( user.id, true);
    acl.setWriteAccess( user.id, true);

    console.log("client.setACL(acl)");

    client.setACL(acl);
    user.setACL(acl);

    console.log("saving acl on user and new client obj");
    console.log(acl);

    saveAll([user,client]).then((parseObjs)=>{
      console.log("ACL SAVED ......");
      console.log(tenant.id+'_client' + " getRole");
      getRole(tenant.id+'_client').then((clientRole)=>{
        console.log("clientRole : " + JSON.stringify(clientRole));
        clientRole.getUsers().add(user);
        getRole(tenant.id).then((globalRole)=>{
          globalRole.getUsers().add(user);
          saveAll([clientRole,globalRole]).then((parseObjs)=>{
            resolve(client);
          }).catch((error)=>{
            reject(error);
          });
        }).catch((error)=>{
          reject(error);
        });
      }).catch((error)=>{
        reject(error);
      });
    }).catch((error)=>{
      reject(error);
    });
  });
}

Parse.Cloud.define('updateClient', function(request, response){
  console.log(JSON.stringify(request.params));
  response.success("updateClient");
});

Parse.Cloud.define('addTenant', function(request, response){
  addTenant(request).then((tenant)=>{
      response.success(tenant);
  }).catch((error)=>{
    response.error(error);
  });
});

Parse.Cloud.define('getUserRole', function(request, response){

  if(!Parse.User.current()){
    response.error('Request did not have an authenticated user attached with it');
  }

  var userQuery = new Parse.Query(Parse.User);
  userQuery.equalTo("objectId", Parse.User.current().id);
  userQuery.include("role");
  userQuery.find({
    success: function(user)
    {
      if(userRetrieved[0]){
        response.success({role: user.get("role").get("name")});
      }
    },
    error: function(user, error)
    {
      response.error('Request failed: ' + JSON.stringify(error,null,2));
    }
  });
});

Parse.Cloud.define('hasRole', function(request, response){
  if(!Parse.User.current()){
    response.error('Request did not have an authenticated user attached with it');
  }
  else {
    userHasRole(request.params.parseSessionToken, request.params.role)
      .then(function(hasRole){
        response.success({hasRole: hasRole});
      },
      function(hasRole, error){
        console.error('Request failed: ' + JSON.stringify(error,null,2));
        response.error('Request failed: ' + JSON.stringify(error,null,2));
      });
  }
});

var userHasRole = function(username, rolename) {
  var queryRole = new Parse.Query(Parse.Role);
  queryRole.equalTo('name', rolename);
  return queryRole.first({useMasterKey:true})
    .then(function(roleObject){
      var queryForUsername = roleObject.relation('users').query();
      queryForUsername.equalTo('username', username)
      return queryForUsername.first({useMasterKey:true})
        .then(function(userObject){
          if(userObject){
            console.log(username + ' has role: ' + rolename);
            return Parse.Promise.as(true);
          }
          else{
            console.log(username + ' does not have role: ' + rolename);
            return Parse.Promise.as(false);
          }
        });
    });
}